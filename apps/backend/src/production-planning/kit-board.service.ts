import { Injectable } from "@nestjs/common";
import {
  InventorySnapshotStatus,
  OrderStage,
  PackingListStatus,
  ProductKind,
} from "@prisma/client";
import { toBaseCurrency } from "../common/currency.util";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { constrainsKitCapacity } from "./bom-part.util";
import { crmVelocityQty } from "./crm-demand-velocity.util";
import { monthKeyUtc } from "./forecast-history-merge.util";
import {
  buildKitBoard,
  filterKitStockWarehouses,
  filterPackWarehouses,
  groupSnapshotStock,
  KIT_BOARD_CLASS_LOOKBACK_MONTHS,
  KIT_BOARD_COVER_MONTHS,
  KIT_BOARD_SALES_LOOKBACK_MONTHS,
  resolveKitCategory,
  resolveKitSystem,
  type KitBoardKitInput,
  type KitBoardRow,
  type KitBoardWarehouse,
} from "./kit-board.util";
import { isOpenPackingStatus, recentYearMonthKeys } from "./kit-portfolio.util";
import { monthsAgoUtc } from "./planning-safety.util";
import { PlanningSettingsService } from "./planning-settings.service";

/** Shipped and closed orders. Open pipeline is still on the shelf, so it is not sales history. */
const KIT_BOARD_SALES_STAGES: OrderStage[] = [
  OrderStage.SHIPPED,
  OrderStage.AWAITING_RECEIPT,
  OrderStage.RECEIVED,
  OrderStage.COMPLETED,
];

export type KitBoardPackRequestSummary = {
  listId: string | null;
  status: "DRAFT" | "APPROVED" | null;
  capacityUsed: number;
  capacityLimit: number;
};

export type KitBoardViewRow = KitBoardRow & {
  /** Qty already on the open packing list (DRAFT/APPROVED). */
  alreadyInRequest: number;
  inPackingStatus: "DRAFT" | "APPROVED" | null;
};

export type KitBoardView = {
  coverMonths: number;
  lookbackMonths: number;
  classLookbackMonths: number;
  snapshotPostedAt: string | null;
  warehouses: KitBoardWarehouse[];
  /** 44 + Suprex — kit leftover / Увага. */
  stockWarehouses: KitBoardWarehouse[];
  /** 39 ABM + 40 ABM — pack assembly. */
  packWarehouses: KitBoardWarehouse[];
  /** Current open packing request capacity (week limit). */
  packRequest: KitBoardPackRequestSummary;
  rows: KitBoardViewRow[];
};

@Injectable()
export class KitBoardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly planningSettings: PlanningSettingsService,
  ) {}

  async getBoard(_coverMonthsInput?: number): Promise<KitBoardView> {
    const coverMonths = KIT_BOARD_COVER_MONTHS;
    const lookbackMonths = KIT_BOARD_SALES_LOOKBACK_MONTHS;
    const classLookbackMonths = KIT_BOARD_CLASS_LOOKBACK_MONTHS;
    const monthKeys = recentYearMonthKeys(new Date(), classLookbackMonths);

    const [posted, kits, rates, packing, planningCfg] = await Promise.all([
      this.prisma.inventorySnapshot.findFirst({
        where: { status: InventorySnapshotStatus.POSTED },
        orderBy: { postedAt: "desc" },
        select: { id: true, postedAt: true },
      }),
      this.prisma.product.findMany({
        where: { kind: ProductKind.KIT, isActive: true },
        select: { id: true, sku: true, name: true, characteristics: true },
        orderBy: { sku: "asc" },
      }),
      this.settings.getExchangeRates(),
      this.prisma.packingList.findFirst({
        where: { status: { in: [PackingListStatus.DRAFT, PackingListStatus.APPROVED] } },
        orderBy: { cycleStart: "desc" },
        include: {
          lines: { select: { kitProductId: true, qtyApproved: true } },
        },
      }),
      this.planningSettings.getSettings(),
    ]);

    const kitIds = kits.map((kit) => kit.id);
    const boms = kitIds.length
      ? await this.prisma.kitBom.findMany({
          where: { isActive: true, kitProductId: { in: kitIds } },
          orderBy: [{ effectiveFrom: "desc" }, { revision: "desc" }],
          include: {
            lines: {
              include: { component: { select: { id: true, sku: true, name: true } } },
            },
          },
        })
      : [];

    const bomByKit = new Map<string, (typeof boms)[number]>();
    for (const bom of boms) {
      if (!bomByKit.has(bom.kitProductId)) bomByKit.set(bom.kitProductId, bom);
    }

    const componentIds = new Set<string>();
    for (const bom of bomByKit.values()) {
      for (const line of bom.lines) componentIds.add(line.componentProductId);
    }

    const stockProductIds = [...new Set([...kitIds, ...componentIds])];
    let qtyByProduct = new Map<string, Record<string, number>>();
    let warehouses: KitBoardWarehouse[] = [];

    if (posted && stockProductIds.length > 0) {
      const lines = await this.prisma.inventorySnapshotLine.findMany({
        where: { snapshotId: posted.id, productId: { in: stockProductIds } },
        select: {
          productId: true,
          warehouseId: true,
          warehouseRaw: true,
          qty: true,
          warehouse: { select: { name: true } },
        },
      });
      const grouped = groupSnapshotStock(
        lines.map((line) => ({
          productId: line.productId,
          qty: line.qty,
          warehouseId: line.warehouseId,
          warehouseRaw: line.warehouseRaw,
          warehouseName: line.warehouse?.name ?? null,
        })),
      );
      qtyByProduct = grouped.qtyByProduct;
      warehouses = grouped.warehouses;
    }

    const classSince = monthsAgoUtc(classLookbackMonths);
    const salesSince = monthsAgoUtc(lookbackMonths);
    const orderItems = kitIds.length
      ? await this.prisma.orderItem.findMany({
          where: {
            productId: { in: kitIds },
            qty: { gt: 0 },
            order: {
              createdAt: { gte: classSince },
              orderStage: { in: KIT_BOARD_SALES_STAGES },
            },
          },
          select: {
            productId: true,
            qty: true,
            price: true,
            order: { select: { createdAt: true, currency: true } },
          },
        })
      : [];

    const soldLast3ByKit = new Map<string, number>();
    const monthlyByKit = new Map<string, Record<string, number>>();
    const revenueByKit = new Map<string, number>();

    for (const item of orderItems) {
      if (!item.productId) continue;
      const qty = crmVelocityQty(item.qty);
      if (!(qty > 0)) continue;
      const createdAt = item.order.createdAt;
      const ym = monthKeyUtc(createdAt);
      const monthRow = monthlyByKit.get(item.productId) ?? {};
      monthRow[ym] = (monthRow[ym] ?? 0) + qty;
      monthlyByKit.set(item.productId, monthRow);

      revenueByKit.set(
        item.productId,
        (revenueByKit.get(item.productId) ?? 0) +
          toBaseCurrency(item.price * qty, item.order.currency, rates),
      );

      if (createdAt >= salesSince) {
        soldLast3ByKit.set(
          item.productId,
          (soldLast3ByKit.get(item.productId) ?? 0) + qty,
        );
      }
    }

    const boardKits: KitBoardKitInput[] = kits.map((kit) => {
      const bom = bomByKit.get(kit.id);
      const sold = soldLast3ByKit.get(kit.id) ?? 0;
      return {
        productId: kit.id,
        sku: kit.sku,
        name: kit.name,
        qtyByWarehouse: qtyByProduct.get(kit.id) ?? {},
        avgMonthlySold: sold / Math.max(1, lookbackMonths),
        revenue: Math.round((revenueByKit.get(kit.id) ?? 0) * 100) / 100,
        monthlySold: monthlyByKit.get(kit.id) ?? {},
        system: resolveKitSystem(kit.sku, kit.characteristics),
        category: resolveKitCategory(kit.characteristics),
        parts: (bom?.lines ?? []).map((line) => ({
          productId: line.componentProductId,
          sku: line.component?.sku ?? "",
          name: line.component?.name ?? "",
          qtyPerKit: line.qtyPerKit.toNumber(),
          scrapPct: line.scrapPct?.toNumber() ?? 0,
          constrains: constrainsKitCapacity({
            sku: line.component?.sku,
            name: line.component?.name,
          }),
          qtyByWarehouse: qtyByProduct.get(line.componentProductId) ?? {},
        })),
      };
    });

    const baseRows = buildKitBoard({ warehouses, kits: boardKits, coverMonths, monthKeys });
    const packingOpen = isOpenPackingStatus(packing?.status);
    const alreadyByKit = new Map(
      packingOpen
        ? (packing?.lines ?? []).map((line) => [line.kitProductId, line.qtyApproved] as const)
        : [],
    );
    const capacityUsed = packingOpen
      ? (packing?.lines ?? []).reduce((sum, line) => sum + line.qtyApproved, 0)
      : 0;
    const capacityLimit =
      packing?.capacityLimit ?? planningCfg.packCapacityPerCycle;
    const packingStatus =
      packingOpen && (packing?.status === "DRAFT" || packing?.status === "APPROVED")
        ? packing.status
        : null;

    const rows: KitBoardViewRow[] = baseRows.map((row) => {
      const alreadyInRequest = packingOpen ? (alreadyByKit.get(row.productId) ?? 0) : 0;
      // Remaining pack suggestion after qty already sent to this week's packing request.
      const toPack = Math.max(0, row.toPack - alreadyInRequest);
      const remainingNeed = Math.max(0, row.need - alreadyInRequest);
      const toProduce = Math.max(0, remainingNeed - toPack);
      let tone = row.tone;
      if (!(row.avgMonthlySold > 0)) tone = "no_sales";
      else if (toPack > 0) tone = "pack";
      else if (remainingNeed === 0) tone = "enough";
      else if (row.canAssemble === 0) tone = "missing_parts";
      else tone = "parts_shared";
      return {
        ...row,
        toPack,
        toPackWarehouseId: toPack > 0 ? row.toPackWarehouseId : null,
        toProduce,
        tone,
        alreadyInRequest,
        inPackingStatus: alreadyInRequest > 0 ? packingStatus : null,
      };
    });

    return {
      coverMonths,
      lookbackMonths,
      classLookbackMonths,
      snapshotPostedAt: posted?.postedAt?.toISOString() ?? null,
      warehouses,
      stockWarehouses: filterKitStockWarehouses(warehouses),
      packWarehouses: filterPackWarehouses(warehouses),
      packRequest: {
        listId: packingOpen ? (packing?.id ?? null) : null,
        status: packingStatus,
        capacityUsed,
        capacityLimit,
      },
      rows,
    };
  }
}
