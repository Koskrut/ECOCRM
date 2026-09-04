import { Injectable } from "@nestjs/common";
import {
  InventorySnapshotStatus,
  FactoryOrderStatus,
  OrderStage,
  PackingListStatus,
  ProductKind,
  ReservationHardness,
  ReservationStatus,
  SalesHistoryUploadStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { toBaseCurrency } from "../common/currency.util";
import { ANALYTICS_EXCLUDED_ORDER_STAGES } from "../analytics/analytics.constants";
import { DemandForecastService } from "./demand-forecast.service";
import { MrpConfigService } from "./mrp-config.service";
import { PlanningCalculationService } from "./planning-calculation.service";
import { PlanningSettingsService } from "./planning-settings.service";
import { monthsAgoUtc } from "./planning-safety.util";
import {
  assignParetoClasses,
  assignXyzClass,
  applyMinProduceLot,
  computeCoverTarget,
  computeKitBuild,
  computeKitPositionPlan,
  computeIdealProducePlan,
  computeWeeklyPackNeed,
  coverTone,
  effectiveStock,
  fillPeriodSeries,
  isOpenPackingStatus,
  isoWeekKeyUtc,
  recentIsoWeekKeys,
  recentYearMonthKeys,
  remainingPackQty,
  weeksOfCover,
  type CoverTone,
  type ParetoClass,
  type XyzClass,
  type XyzReason,
  type XyzSource,
} from "./kit-portfolio.util";

export type KitBomListLine = {
  componentProductId: string;
  componentSku: string;
  componentName: string;
  componentKind: string;
  qtyPerKit: number;
  scrapPct: number | null;
  sortOrder: number;
  available: number;
  isBottleneck: boolean;
};

export type KitBomListItem = {
  kitProductId: string;
  sku: string;
  name: string;
  unit: string;
  basePrice: number;
  isActive: boolean;
  bomId: string | null;
  revision: number | null;
  effectiveFrom: string | null;
  linesCount: number;
  paretoClass: ParetoClass;
  xyzClass: XyzClass | null;
  demandCv: number | null;
  xyzReason: XyzReason;
  xyzSource: XyzSource | null;
  stockFinished: number;
  stockNow: number;
  coverTarget: number;
  targetStock: number;
  maxBuildNow: number;
  /** Toward ideal (coverTarget). */
  canPackNow: number;
  /** Toward ideal after parts; raw gap. */
  toWork: number;
  /** toWork rounded up to minProduceLot when > 0. */
  toWorkLot: number;
  /** Toward weekly pack cycle need. */
  canPackCycle: number;
  toWorkCycle: number;
  alreadyInRequest: number;
  inPackingStatus: "DRAFT" | "APPROVED" | null;
  inPackingDueAt: string | null;
  remainingPackIdeal: number;
  factoryWaitingQty: number;
  factoryWaitingDueAt: string | null;
  bottleneckComponentId: string | null;
  bottleneckQtyPerKit: number;
  suggestedFactoryQty: number;
  minPackLot: number;
  minProduceLot: number;
  weeksOfCover: number | null;
  coverTone: CoverTone;
  avgMonthlySold: number;
  hardNeed: number;
  weeklyPackNeed: number;
  waitingOrders: number;
  bottleneckSku: string | null;
  bottleneckName: string | null;
  lines: KitBomListLine[];
};

type BomWithLines = {
  id: string;
  revision: number;
  effectiveFrom: Date;
  lines: Array<{
    componentProductId: string;
    qtyPerKit: { toString(): string } | number;
    scrapPct: { toString(): string } | number | null;
    sortOrder: number;
    component: { id: string; sku: string; name: string; kind: string } | null;
  }>;
};

@Injectable()
export class KitBomListService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly demandForecast: DemandForecastService,
    private readonly calculations: PlanningCalculationService,
    private readonly mrpConfig: MrpConfigService,
    private readonly planningSettings: PlanningSettingsService,
    private readonly settings: SettingsService,
  ) {}

  async listActive(q?: string): Promise<KitBomListItem[]> {
    const query = q?.trim();
    const kits = await this.prisma.product.findMany({
      where: {
        kind: ProductKind.KIT,
        isActive: true,
        ...(query
          ? {
              OR: [
                { sku: { contains: query, mode: "insensitive" } },
                { name: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        sku: true,
        name: true,
        unit: true,
        basePrice: true,
        isActive: true,
      },
      orderBy: { sku: "asc" },
    });
    if (kits.length === 0) return [];

    const kitIds = kits.map((k) => k.id);
    const boms = await this.prisma.kitBom.findMany({
      where: { isActive: true, kitProductId: { in: kitIds } },
      include: {
        lines: {
          orderBy: { sortOrder: "asc" },
          include: {
            component: { select: { id: true, sku: true, name: true, kind: true } },
          },
        },
      },
      orderBy: [{ effectiveFrom: "desc" }, { revision: "desc" }],
    });

    const bomByKit = new Map<string, BomWithLines>();
    for (const bom of boms) {
      if (!bomByKit.has(bom.kitProductId)) bomByKit.set(bom.kitProductId, bom);
    }

    const componentIds = [
      ...new Set(
        [...bomByKit.values()].flatMap((b) => b.lines.map((l) => l.componentProductId)),
      ),
    ];
    const allIds = [...new Set([...kitIds, ...componentIds])];

    const [horizon, planningSettings, rates, postedSnapshot] = await Promise.all([
      this.mrpConfig.getHorizon(),
      this.planningSettings.getSettings(),
      this.settings.getExchangeRates(),
      this.prisma.inventorySnapshot.findFirst({
        where: { status: InventorySnapshotStatus.POSTED },
        orderBy: { postedAt: "desc" },
        select: { id: true },
      }),
    ]);
    const warnWeeks = Math.round((horizon.warnCoverDays / 7) * 10) / 10;
    const criticalWeeks = Math.round((horizon.criticalCoverDays / 7) * 10) / 10;

    const xyzSince = new Date();
    xyzSince.setUTCDate(xyzSince.getUTCDate() - 26 * 7);
    const excluded = [...ANALYTICS_EXCLUDED_ORDER_STAGES] as OrderStage[];

    const [
      stockRows,
      reservedRows,
      forecastMap,
      forecastCycle,
      packDemand,
      latestSales,
      revenueRows,
      waitingRows,
      shippedRows,
      packing,
      factoryOpenLines,
    ] = await Promise.all([
      postedSnapshot
        ? this.prisma.inventorySnapshotLine.groupBy({
            by: ["productId"],
            where: { snapshotId: postedSnapshot.id, productId: { in: allIds } },
            _sum: { qty: true },
          })
        : Promise.resolve([]),
      this.prisma.materialReservation.groupBy({
        by: ["productId"],
        where: {
          productId: { in: allIds },
          status: ReservationStatus.ACTIVE,
          hardness: ReservationHardness.HARD,
        },
        _sum: { qty: true },
      }),
      this.demandForecast.getDemandForecastMap(kitIds),
      this.demandForecast.getForecastQtyMap(planningSettings.packCycleDays, kitIds),
      this.calculations.getPackDemandByProduct(),
      this.prisma.salesHistoryUpload.findFirst({
        where: { status: SalesHistoryUploadStatus.POSTED },
        orderBy: { postedAt: "desc" },
        select: { id: true },
      }),
      this.prisma.orderItem.findMany({
        where: {
          productId: { in: kitIds },
          order: {
            createdAt: { gte: monthsAgoUtc(horizon.velocityLookbackMonths) },
            OR: [{ orderStage: { notIn: excluded } }, { orderStage: null }],
          },
        },
        select: { productId: true, qty: true, price: true, order: { select: { currency: true } } },
      }),
      this.prisma.orderItem.findMany({
        where: {
          productId: { in: kitIds },
          order: {
            orderStage: { in: [OrderStage.AWAITING_STOCK], notIn: excluded },
          },
        },
        select: { productId: true, orderId: true, qty: true, qtyShipped: true },
      }),
      this.prisma.orderItem.findMany({
        where: {
          productId: { in: kitIds },
          qtyShipped: { gt: 0 },
          order: {
            createdAt: { gte: xyzSince },
            orderStage: { notIn: [OrderStage.CANCELED, OrderStage.REFUSED] },
          },
        },
        select: {
          productId: true,
          qtyShipped: true,
          order: { select: { createdAt: true } },
        },
      }),
      this.prisma.packingList.findFirst({
        where: { status: { in: [PackingListStatus.DRAFT, PackingListStatus.APPROVED] } },
        orderBy: { cycleStart: "desc" },
        include: {
          lines: { select: { kitProductId: true, qtyApproved: true, dueAt: true } },
        },
      }),
      componentIds.length > 0
        ? this.prisma.factoryOrderLine.findMany({
            where: {
              partProductId: { in: componentIds },
              factoryOrder: {
                status: {
                  in: [
                    FactoryOrderStatus.DRAFT,
                    FactoryOrderStatus.OPEN,
                    FactoryOrderStatus.PARTIAL,
                  ],
                },
              },
            },
            select: {
              partProductId: true,
              qtyOrdered: true,
              qtyReceived: true,
              dueAt: true,
              factoryOrder: { select: { dueAt: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const packingOpen = isOpenPackingStatus(packing?.status);
    const alreadyByKit = new Map(
      (packing?.lines ?? []).map((l) => [l.kitProductId, l.qtyApproved]),
    );
    const packingDueByKit = new Map(
      (packing?.lines ?? []).map((l) => [
        l.kitProductId,
        (l.dueAt ?? packing?.cycleEnd ?? null) as Date | null,
      ]),
    );

    const factoryByPart = new Map<string, { qty: number; dueAt: Date | null }>();
    for (const line of factoryOpenLines) {
      const openQty = Math.max(0, line.qtyOrdered - line.qtyReceived);
      if (openQty <= 0) continue;
      const due = line.dueAt ?? line.factoryOrder.dueAt;
      const prev = factoryByPart.get(line.partProductId);
      if (!prev) {
        factoryByPart.set(line.partProductId, { qty: openQty, dueAt: due });
      } else {
        const nextDue =
          prev.dueAt == null
            ? due
            : due == null
              ? prev.dueAt
              : prev.dueAt.getTime() <= due.getTime()
                ? prev.dueAt
                : due;
        factoryByPart.set(line.partProductId, {
          qty: prev.qty + openQty,
          dueAt: nextDue,
        });
      }
    }

    const stockMap = new Map(
      stockRows.filter((r) => r.productId).map((r) => [r.productId!, r._sum.qty ?? 0]),
    );
    const reservedMap = new Map(reservedRows.map((r) => [r.productId, r._sum.qty ?? 0]));
    const availableOf = (id: string) =>
      Math.max(0, (stockMap.get(id) ?? 0) - (reservedMap.get(id) ?? 0));

    const revenueByKit = new Map<string, number>();
    for (const row of revenueRows) {
      if (!row.productId) continue;
      const add = toBaseCurrency(row.price * row.qty, row.order.currency, rates);
      revenueByKit.set(row.productId, (revenueByKit.get(row.productId) ?? 0) + add);
    }

    const ranked = assignParetoClasses(
      kitIds.map((id) => ({
        productId: id,
        revenue: Math.round((revenueByKit.get(id) ?? 0) * 100) / 100,
      })),
    );
    const paretoById = new Map(ranked.map((r) => [r.productId, r]));

    const historyByKit = new Map<string, Map<string, number>>();
    if (latestSales) {
      const historyRows = await this.prisma.salesHistoryLine.findMany({
        where: {
          uploadId: latestSales.id,
          productId: { in: kitIds },
          soldAt: { gte: monthsAgoUtc(Math.max(horizon.velocityLookbackMonths, 18)) },
        },
        select: { productId: true, yearMonth: true, soldAt: true, qty: true },
      });
      for (const row of historyRows) {
        if (!row.productId) continue;
        const ym =
          row.yearMonth ??
          `${row.soldAt.getUTCFullYear()}-${String(row.soldAt.getUTCMonth() + 1).padStart(2, "0")}`;
        const byMonth = historyByKit.get(row.productId) ?? new Map<string, number>();
        byMonth.set(ym, (byMonth.get(ym) ?? 0) + row.qty);
        historyByKit.set(row.productId, byMonth);
      }
    }

    const weekKeys = recentIsoWeekKeys(new Date(), 26);
    const monthKeys = recentYearMonthKeys(new Date(), 12);
    const crmWeeksByKit = new Map<string, Map<string, number>>();
    for (const row of shippedRows) {
      if (!row.productId) continue;
      const wk = isoWeekKeyUtc(row.order.createdAt);
      const byWeek = crmWeeksByKit.get(row.productId) ?? new Map<string, number>();
      byWeek.set(wk, (byWeek.get(wk) ?? 0) + row.qtyShipped);
      crmWeeksByKit.set(row.productId, byWeek);
    }

    const waitingByKit = new Map<string, Set<string>>();
    for (const row of waitingRows) {
      if (!row.productId) continue;
      if (row.qty - row.qtyShipped <= 0) continue;
      const set = waitingByKit.get(row.productId) ?? new Set<string>();
      set.add(row.orderId);
      waitingByKit.set(row.productId, set);
    }

    return kits.map((kit) => {
      const bom = bomByKit.get(kit.id) ?? null;
      const build = computeKitBuild(
        (bom?.lines ?? []).map((line) => ({
          componentProductId: line.componentProductId,
          sku: line.component?.sku ?? "",
          name: line.component?.name,
          qtyPerKit: Number(line.qtyPerKit),
          scrapPct: line.scrapPct != null ? Number(line.scrapPct) : 0,
          available: availableOf(line.componentProductId),
        })),
      );
      const stockFinished = availableOf(kit.id);
      const avgMonthlySold = forecastMap.get(kit.id)?.avgMonthlySold ?? 0;
      const hardNeed = packDemand.get(kit.id)?.hard ?? 0;
      const softNeed = packDemand.get(kit.id)?.soft ?? 0;
      const forecastNeed = forecastCycle.get(kit.id) ?? 0;
      const weeklyPackNeed = computeWeeklyPackNeed({
        hardNeed,
        forecastNeed,
        softNeed,
        stockKits: stockFinished,
        demandMix: planningSettings.demandMix,
      });
      const coverTarget = computeCoverTarget({ avgMonthlySold, warnWeeks });
      const alreadyInRequest = packingOpen ? (alreadyByKit.get(kit.id) ?? 0) : 0;
      const inPackingDue = packingOpen ? (packingDueByKit.get(kit.id) ?? null) : null;
      const positionPlan = computeKitPositionPlan({
        stockFinished,
        maxBuildNow: build.maxBuildNow,
        weeklyPackNeed,
        coverTarget,
        alreadyInRequest,
      });
      const idealPlan = computeIdealProducePlan({
        stockFinished,
        maxBuildNow: build.maxBuildNow,
        coverTarget,
      });
      const remainingPackIdeal = remainingPackQty(idealPlan.canPackNow, alreadyInRequest);
      const toWorkLot = applyMinProduceLot(idealPlan.toWork, planningSettings.minProduceLot);
      let factoryWaitingQty = 0;
      let factoryWaitingDueAt: Date | null = null;
      for (const line of bom?.lines ?? []) {
        const fw = factoryByPart.get(line.componentProductId);
        if (!fw) continue;
        factoryWaitingQty += fw.qty;
        if (fw.dueAt) {
          if (!factoryWaitingDueAt || fw.dueAt.getTime() < factoryWaitingDueAt.getTime()) {
            factoryWaitingDueAt = fw.dueAt;
          }
        }
      }
      const weeks = weeksOfCover(effectiveStock(stockFinished, build.maxBuildNow), avgMonthlySold);
      const crmWeeks = crmWeeksByKit.get(kit.id) ?? new Map<string, number>();
      let xyz = assignXyzClass(fillPeriodSeries(crmWeeks, weekKeys), { source: "crm_weeks" });
      if (xyz.xyzReason === "insufficient_history") {
        const monthly = historyByKit.get(kit.id) ?? new Map<string, number>();
        if (monthly.size > 0) {
          xyz = assignXyzClass(fillPeriodSeries(monthly, monthKeys), { source: "sales_months" });
        }
      }
      const pareto = paretoById.get(kit.id);
      const bottleneckIds = new Set(
        build.components.filter((c) => c.isBottleneck).map((c) => c.componentProductId),
      );

      return {
        kitProductId: kit.id,
        sku: kit.sku,
        name: kit.name,
        unit: kit.unit,
        basePrice: kit.basePrice,
        isActive: kit.isActive,
        bomId: bom?.id ?? null,
        revision: bom?.revision ?? null,
        effectiveFrom: bom?.effectiveFrom.toISOString() ?? null,
        linesCount: bom?.lines.length ?? 0,
        paretoClass: pareto?.paretoClass ?? "C",
        xyzClass: xyz.xyzClass,
        demandCv: xyz.demandCv,
        xyzReason: xyz.xyzReason,
        xyzSource: xyz.xyzSource,
        stockFinished,
        stockNow: positionPlan.stockNow,
        coverTarget: positionPlan.coverTarget,
        targetStock: positionPlan.targetStock,
        maxBuildNow: build.maxBuildNow,
        canPackNow: idealPlan.canPackNow,
        toWork: idealPlan.toWork,
        toWorkLot,
        canPackCycle: positionPlan.canPackNow,
        toWorkCycle: positionPlan.toWork,
        alreadyInRequest,
        inPackingStatus: packingOpen
          ? ((packing?.status as "DRAFT" | "APPROVED") ?? null)
          : null,
        inPackingDueAt: inPackingDue?.toISOString() ?? null,
        remainingPackIdeal,
        factoryWaitingQty,
        factoryWaitingDueAt: factoryWaitingDueAt?.toISOString() ?? null,
        bottleneckComponentId: build.bottleneckComponentId,
        bottleneckQtyPerKit: build.bottleneckQtyPerKit,
        suggestedFactoryQty:
          (toWorkLot > 0 || positionPlan.toWork > 0) && build.bottleneckComponentId
            ? Math.max(
                1,
                Math.ceil(
                  Math.max(toWorkLot, positionPlan.toWork) * Math.max(0, build.bottleneckQtyPerKit),
                ) - Math.floor(availableOf(build.bottleneckComponentId)),
              )
            : 0,
        minPackLot: planningSettings.minPackLot,
        minProduceLot: planningSettings.minProduceLot,
        weeksOfCover: weeks,
        coverTone: coverTone(weeks, warnWeeks, criticalWeeks),
        avgMonthlySold,
        hardNeed,
        weeklyPackNeed,
        waitingOrders: waitingByKit.get(kit.id)?.size ?? 0,
        bottleneckSku: build.bottleneckSku,
        bottleneckName: build.bottleneckName,
        lines: (bom?.lines ?? []).map((line) => ({
          componentProductId: line.componentProductId,
          componentSku: line.component?.sku ?? "",
          componentName: line.component?.name ?? "",
          componentKind: line.component?.kind ?? "PART",
          qtyPerKit: Number(line.qtyPerKit),
          scrapPct: line.scrapPct != null ? Number(line.scrapPct) : null,
          sortOrder: line.sortOrder,
          available: availableOf(line.componentProductId),
          isBottleneck: bottleneckIds.has(line.componentProductId),
        })),
      };
    });
  }
}
