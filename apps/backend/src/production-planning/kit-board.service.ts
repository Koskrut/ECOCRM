import { Injectable } from "@nestjs/common";
import { InventorySnapshotStatus, OrderStage, ProductKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { constrainsKitCapacity } from "./bom-part.util";
import { crmVelocityQty } from "./crm-demand-velocity.util";

/** Shipped and closed orders. Open pipeline is still on the shelf, so it is not sales history. */
const KIT_BOARD_SALES_STAGES: OrderStage[] = [
  OrderStage.SHIPPED,
  OrderStage.AWAITING_RECEIPT,
  OrderStage.RECEIVED,
  OrderStage.COMPLETED,
];
import {
  buildKitBoard,
  groupSnapshotStock,
  type KitBoardKitInput,
  type KitBoardRow,
  type KitBoardWarehouse,
} from "./kit-board.util";
import { MrpConfigService } from "./mrp-config.service";
import { monthsAgoUtc } from "./planning-safety.util";

export type KitBoardView = {
  coverMonths: number;
  lookbackMonths: number;
  snapshotPostedAt: string | null;
  warehouses: KitBoardWarehouse[];
  rows: KitBoardRow[];
};

function clampCoverMonths(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return 1;
  return Math.min(6, Math.max(1, Math.round(value)));
}

@Injectable()
export class KitBoardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mrpConfig: MrpConfigService,
  ) {}

  async getBoard(coverMonthsInput?: number): Promise<KitBoardView> {
    const horizon = await this.mrpConfig.getHorizon();
    const coverMonths = clampCoverMonths(coverMonthsInput);
    const lookbackMonths = horizon.velocityLookbackMonths;

    const [posted, kits] = await Promise.all([
      this.prisma.inventorySnapshot.findFirst({
        where: { status: InventorySnapshotStatus.POSTED },
        orderBy: { postedAt: "desc" },
        select: { id: true, postedAt: true },
      }),
      this.prisma.product.findMany({
        where: { kind: ProductKind.KIT, isActive: true },
        select: { id: true, sku: true, name: true },
        orderBy: { sku: "asc" },
      }),
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

    const since = monthsAgoUtc(lookbackMonths);
    const orderItems = kitIds.length
      ? await this.prisma.orderItem.findMany({
          where: {
            productId: { in: kitIds },
            qty: { gt: 0 },
            order: {
              createdAt: { gte: since },
              orderStage: { in: KIT_BOARD_SALES_STAGES },
            },
          },
          select: { productId: true, qty: true },
        })
      : [];

    const soldByKit = new Map<string, number>();
    for (const item of orderItems) {
      if (!item.productId) continue;
      soldByKit.set(
        item.productId,
        (soldByKit.get(item.productId) ?? 0) + crmVelocityQty(item.qty),
      );
    }

    const boardKits: KitBoardKitInput[] = kits.map((kit) => {
      const bom = bomByKit.get(kit.id);
      const sold = soldByKit.get(kit.id) ?? 0;
      return {
        productId: kit.id,
        sku: kit.sku,
        name: kit.name,
        qtyByWarehouse: qtyByProduct.get(kit.id) ?? {},
        avgMonthlySold: sold / Math.max(1, lookbackMonths),
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

    return {
      coverMonths,
      lookbackMonths,
      snapshotPostedAt: posted?.postedAt?.toISOString() ?? null,
      warehouses,
      rows: buildKitBoard({ warehouses, kits: boardKits, coverMonths }),
    };
  }
}
