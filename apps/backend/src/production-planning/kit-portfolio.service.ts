import { Injectable } from "@nestjs/common";
import {
  FactoryOrderStatus,
  InventorySnapshotStatus,
  OrderStage,
  PackingListStatus,
  ProductKind,
  ReservationHardness,
  ReservationStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { getBaseCurrency, toBaseCurrency } from "../common/currency.util";
import { ANALYTICS_EXCLUDED_ORDER_STAGES } from "../analytics/analytics.constants";
import { DemandForecastService } from "./demand-forecast.service";
import { MrpConfigService } from "./mrp-config.service";
import { PlanningCalculationService } from "./planning-calculation.service";
import { PlanningSettingsService } from "./planning-settings.service";
import { SalesHistoryService } from "./sales-history.service";
import { monthsAgoUtc } from "./planning-safety.util";
import {
  assignParetoClasses,
  assignPile,
  computeKitBuild,
  coverTone,
  effectiveStock,
  groupSharedBottlenecks,
  suggestedPackQty,
  weeksOfCover,
  type KitPile,
  type SharedBottleneckGroup,
} from "./kit-portfolio.util";

export type KitPortfolioKit = {
  productId: string;
  sku: string;
  name: string;
  revenue: number;
  sharePct: number;
  cumulativePct: number;
  inPareto80: boolean;
  pile: KitPile;
  stockFinished: number;
  maxBuildNow: number;
  weeksOfCover: number | null;
  coverTone: "critical" | "warn" | "ok";
  avgMonthlySold: number;
  hardNeed: number;
  waitingOrders: number;
  suggestedPackQty: number;
  alreadyInRequest: number;
  suggestedFactoryQty: number;
  bottleneckComponentId: string | null;
  bottleneckSku: string | null;
  bottleneckName: string | null;
  monthlyHistory: Array<{ yearMonth: string; qty: number }>;
  components: Array<{
    componentProductId: string;
    sku: string;
    name: string;
    qtyPerKit: number;
    available: number;
    isBottleneck: boolean;
  }>;
};

export type KitPortfolioView = {
  freshness: Awaited<ReturnType<PlanningCalculationService["getSnapshotFreshness"]>>;
  salesFreshness: Awaited<ReturnType<DemandForecastService["evaluateSalesFreshnessWithCoverage"]>>;
  currency: string;
  lookbackMonths: number;
  warnWeeks: number;
  criticalWeeks: number;
  week: {
    packingListId: string | null;
    packingStatus: PackingListStatus | null;
    used: number;
    limit: number;
    factoryDraftId: string | null;
  };
  summary: {
    packableToday: number;
    blocked: number;
    ending: number;
    pareto80Count: number;
  };
  kits: KitPortfolioKit[];
  sharedBottlenecks: SharedBottleneckGroup[];
};

@Injectable()
export class KitPortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculations: PlanningCalculationService,
    private readonly demandForecast: DemandForecastService,
    private readonly mrpConfig: MrpConfigService,
    private readonly planningSettings: PlanningSettingsService,
    private readonly salesHistory: SalesHistoryService,
    private readonly settings: SettingsService,
  ) {}

  async getBoard(): Promise<KitPortfolioView> {
    const [horizon, planningSettings, freshness, salesFreshness, kits, rates] = await Promise.all([
      this.mrpConfig.getHorizon(),
      this.planningSettings.getSettings(),
      this.calculations.getSnapshotFreshness(),
      this.demandForecast.evaluateSalesFreshnessWithCoverage(),
      this.prisma.product.findMany({
        where: { kind: ProductKind.KIT, isActive: true },
        select: { id: true, sku: true, name: true },
        orderBy: { sku: "asc" },
      }),
      this.settings.getExchangeRates(),
    ]);

    const warnWeeks = Math.round((horizon.warnCoverDays / 7) * 10) / 10;
    const criticalWeeks = Math.round((horizon.criticalCoverDays / 7) * 10) / 10;
    const kitIds = kits.map((k) => k.id);
    const emptyWeek = {
      packingListId: null as string | null,
      packingStatus: null as PackingListStatus | null,
      used: 0,
      limit: planningSettings.packCapacityPerCycle,
      factoryDraftId: null as string | null,
    };

    if (kitIds.length === 0) {
      return {
        freshness,
        salesFreshness,
        currency: getBaseCurrency(rates),
        lookbackMonths: horizon.velocityLookbackMonths,
        warnWeeks,
        criticalWeeks,
        week: emptyWeek,
        summary: { packableToday: 0, blocked: 0, ending: 0, pareto80Count: 0 },
        kits: [],
        sharedBottlenecks: [],
      };
    }

    const postedSnapshot = await this.prisma.inventorySnapshot.findFirst({
      where: { status: InventorySnapshotStatus.POSTED },
      orderBy: { postedAt: "desc" },
      select: { id: true },
    });

    const boms = await this.prisma.kitBom.findMany({
      where: { kitProductId: { in: kitIds }, isActive: true },
      include: {
        lines: { include: { component: { select: { id: true, sku: true, name: true } } } },
      },
      orderBy: [{ effectiveFrom: "desc" }, { revision: "desc" }],
    });
    const bomByKit = new Map<string, (typeof boms)[number]>();
    for (const bom of boms) {
      if (!bomByKit.has(bom.kitProductId)) bomByKit.set(bom.kitProductId, bom);
    }
    const componentIds = [
      ...new Set(boms.flatMap((b) => b.lines.map((l) => l.componentProductId))),
    ];
    const allIds = [...new Set([...kitIds, ...componentIds])];

    const [stockRows, reservedRows, forecastMap, demand, latestSales, packing, factoryDraft] =
      await Promise.all([
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
        this.calculations.getDemandByProduct(),
        this.salesHistory.latestPosted(),
        this.prisma.packingList.findFirst({
          where: { status: { in: [PackingListStatus.DRAFT, PackingListStatus.APPROVED] } },
          orderBy: { cycleStart: "desc" },
          include: { lines: { select: { kitProductId: true, qtyApproved: true } } },
        }),
        this.prisma.factoryOrder.findFirst({
          where: { status: FactoryOrderStatus.DRAFT },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        }),
      ]);

    const stockMap = new Map(
      stockRows.filter((r) => r.productId).map((r) => [r.productId!, r._sum.qty ?? 0]),
    );
    const reservedMap = new Map(reservedRows.map((r) => [r.productId, r._sum.qty ?? 0]));
    const availableOf = (id: string) => Math.max(0, (stockMap.get(id) ?? 0) - (reservedMap.get(id) ?? 0));

    const since = monthsAgoUtc(Math.max(horizon.velocityLookbackMonths, 18));
    const excluded = [...ANALYTICS_EXCLUDED_ORDER_STAGES] as OrderStage[];

    const [historyRows, revenueRows, waitingRows] = await Promise.all([
      latestSales
        ? this.prisma.salesHistoryLine.findMany({
            where: {
              uploadId: latestSales.id,
              productId: { in: kitIds },
              soldAt: { gte: since },
            },
            select: { productId: true, yearMonth: true, soldAt: true, qty: true },
          })
        : Promise.resolve([]),
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
            orderStage: {
              in: [OrderStage.AWAITING_STOCK, OrderStage.CONFIRMED, OrderStage.READY_TO_SHIP],
              notIn: excluded,
            },
          },
        },
        select: { productId: true, orderId: true, qty: true, qtyShipped: true },
      }),
    ]);

    const historyByKit = new Map<string, Map<string, number>>();
    for (const row of historyRows) {
      if (!row.productId) continue;
      const ym =
        row.yearMonth ??
        `${row.soldAt.getUTCFullYear()}-${String(row.soldAt.getUTCMonth() + 1).padStart(2, "0")}`;
      const byMonth = historyByKit.get(row.productId) ?? new Map<string, number>();
      byMonth.set(ym, (byMonth.get(ym) ?? 0) + row.qty);
      historyByKit.set(row.productId, byMonth);
    }

    const revenueByKit = new Map<string, number>();
    for (const row of revenueRows) {
      if (!row.productId) continue;
      const add = toBaseCurrency(row.price * row.qty, row.order.currency, rates);
      revenueByKit.set(row.productId, (revenueByKit.get(row.productId) ?? 0) + add);
    }

    const waitingByKit = new Map<string, Set<string>>();
    for (const row of waitingRows) {
      if (!row.productId) continue;
      if (row.qty - row.qtyShipped <= 0) continue;
      const set = waitingByKit.get(row.productId) ?? new Set<string>();
      set.add(row.orderId);
      waitingByKit.set(row.productId, set);
    }

    const packingIsDraft = packing?.status === PackingListStatus.DRAFT;
    const packingCanEdit = packing == null || packingIsDraft;
    const alreadyByKit = new Map(
      (packing?.lines ?? []).map((l) => [l.kitProductId, l.qtyApproved]),
    );
    const weekUsed = packing?.lines.reduce((s, l) => s + l.qtyApproved, 0) ?? 0;
    const weekLimit = packing?.capacityLimit ?? planningSettings.packCapacityPerCycle;
    const weekLeft = Math.max(0, weekLimit - weekUsed);

    const ranked = assignParetoClasses(
      kits.map((kit) => ({
        productId: kit.id,
        sku: kit.sku,
        name: kit.name,
        revenue: Math.round((revenueByKit.get(kit.id) ?? 0) * 100) / 100,
      })),
    );

    const draftKits = ranked.map((row) => {
      const bom = bomByKit.get(row.productId);
      const build = computeKitBuild(
        (bom?.lines ?? []).map((line) => ({
          componentProductId: line.componentProductId,
          sku: line.component?.sku ?? "",
          name: line.component?.name,
          qtyPerKit: line.qtyPerKit.toNumber(),
          scrapPct: line.scrapPct?.toNumber() ?? 0,
          available: availableOf(line.componentProductId),
        })),
      );
      const stockFinished = availableOf(row.productId);
      const avgMonthlySold = forecastMap.get(row.productId)?.avgMonthlySold ?? 0;
      const hardNeed = demand.get(row.productId)?.hard ?? 0;
      const stock = effectiveStock(stockFinished, build.maxBuildNow);
      const weeks = weeksOfCover(stock, avgMonthlySold);
      const pile = assignPile({
        avgMonthlySold,
        stockFinished,
        maxBuildNow: build.maxBuildNow,
        hardNeed,
        weeksOfCover: weeks,
        warnWeeks,
      });
      const alreadyInRequest = packingIsDraft ? (alreadyByKit.get(row.productId) ?? 0) : 0;
      const capacityLeft = packingCanEdit ? weekLeft : 0;
      const packQty = suggestedPackQty({
        stockFinished,
        maxBuildNow: build.maxBuildNow,
        avgMonthlySold,
        hardNeed,
        warnWeeks,
        alreadyInRequest,
        weekCapacityLeft: capacityLeft,
      });
      const packIgnoringParts = suggestedPackQty({
        stockFinished,
        maxBuildNow: build.maxBuildNow,
        avgMonthlySold,
        hardNeed,
        warnWeeks,
        alreadyInRequest,
        weekCapacityLeft: Math.max(capacityLeft, weekLimit),
        ignoreParts: true,
      });
      const monthly = historyByKit.get(row.productId) ?? new Map<string, number>();
      return {
        ...row,
        pile,
        stockFinished,
        maxBuildNow: build.maxBuildNow,
        weeksOfCover: weeks,
        coverTone: coverTone(weeks, warnWeeks, criticalWeeks),
        avgMonthlySold,
        hardNeed,
        waitingOrders: waitingByKit.get(row.productId)?.size ?? 0,
        suggestedPackQty: packQty,
        alreadyInRequest,
        suggestedFactoryQty: Math.max(
          1,
          Math.ceil(packIgnoringParts * Math.max(0, build.bottleneckQtyPerKit)) -
            Math.floor(build.bottleneckComponentId ? availableOf(build.bottleneckComponentId) : 0),
        ),
        bottleneckComponentId: build.bottleneckComponentId,
        bottleneckSku: build.bottleneckSku,
        bottleneckName: build.bottleneckName,
        bottleneckQtyPerKit: build.bottleneckQtyPerKit,
        suggestedPackIgnoringParts: packIgnoringParts,
        monthlyHistory: [...monthly.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([yearMonth, qty]) => ({ yearMonth, qty })),
        components: build.components,
      };
    });

    const partAvailable = new Map(componentIds.map((id) => [id, availableOf(id)]));
    const sharedBottlenecks = groupSharedBottlenecks(draftKits, partAvailable);

    const ending = draftKits.filter((k) => k.pile === "ending" && k.inPareto80);
    const packableToday = ending.filter((k) => k.maxBuildNow > 0).length;
    const blocked = ending.filter((k) => k.maxBuildNow <= 0).length;

    const kitsOut: KitPortfolioKit[] = draftKits.map((row) => ({
      productId: row.productId,
      sku: row.sku,
      name: row.name,
      revenue: row.revenue,
      sharePct: row.sharePct,
      cumulativePct: row.cumulativePct,
      inPareto80: row.inPareto80,
      pile: row.pile,
      stockFinished: row.stockFinished,
      maxBuildNow: row.maxBuildNow,
      weeksOfCover: row.weeksOfCover,
      coverTone: row.coverTone,
      avgMonthlySold: row.avgMonthlySold,
      hardNeed: row.hardNeed,
      waitingOrders: row.waitingOrders,
      suggestedPackQty: row.suggestedPackQty,
      alreadyInRequest: row.alreadyInRequest,
      suggestedFactoryQty: row.suggestedFactoryQty,
      bottleneckComponentId: row.bottleneckComponentId,
      bottleneckSku: row.bottleneckSku,
      bottleneckName: row.bottleneckName,
      monthlyHistory: row.monthlyHistory,
      components: row.components,
    }));

    return {
      freshness,
      salesFreshness,
      currency: getBaseCurrency(rates),
      lookbackMonths: horizon.velocityLookbackMonths,
      warnWeeks,
      criticalWeeks,
      week: {
        packingListId: packing?.id ?? null,
        packingStatus: packing?.status ?? null,
        used: weekUsed,
        limit: weekLimit,
        factoryDraftId: factoryDraft?.id ?? null,
      },
      summary: {
        packableToday,
        blocked,
        ending: ending.length,
        pareto80Count: draftKits.filter((k) => k.inPareto80).length,
      },
      kits: kitsOut,
      sharedBottlenecks,
    };
  }
}
