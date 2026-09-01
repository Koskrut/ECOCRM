import { forwardRef, Inject, Injectable } from "@nestjs/common";
import {
  FactoryOrderStatus,
  InventorySnapshotStatus,
  OrderStage,
  PackingListStatus,
  ProductKind,
  ProductionBatchStatus,
  ProductionStageCode,
  ReservationHardness,
  ReservationStatus,
  SalesHistoryUploadStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { constrainsKitCapacity } from "./bom-part.util";
import { DemandForecastService } from "./demand-forecast.service";
import { DemandRulesService } from "./demand-rules.service";
import { PlanningSettingsService } from "./planning-settings.service";
import { evaluateSnapshotFreshness } from "./snapshot-freshness.util";

@Injectable()
export class PlanningCalculationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly demandRules: DemandRulesService,
    private readonly settings: PlanningSettingsService,
    @Inject(forwardRef(() => DemandForecastService))
    private readonly demandForecast: DemandForecastService,
  ) {}

  async getAvailability(productId: string, warehouseId?: string) {
    const postedSnapshot = await this.prisma.inventorySnapshot.findFirst({
      where: { status: InventorySnapshotStatus.POSTED },
      orderBy: { postedAt: "desc" },
      select: { id: true, postedAt: true },
    });

    if (!postedSnapshot?.id) {
      return {
        asOfSnapshotId: null,
        asOfSnapshotDate: null,
        productId,
        warehouseId: warehouseId ?? null,
        physical: 0,
        hardReserved: 0,
        softReserved: 0,
        available: 0,
        expectedOutput: 0,
      };
    }

    const lineWhere = {
      snapshotId: postedSnapshot.id,
      productId,
      ...(warehouseId ? { warehouseId } : {}),
    };
    const [stockAgg, hardAgg, softAgg, wipAgg] = await Promise.all([
      this.prisma.inventorySnapshotLine.aggregate({
        where: lineWhere,
        _sum: { qty: true },
      }),
      this.prisma.materialReservation.aggregate({
        where: {
          productId,
          status: ReservationStatus.ACTIVE,
          hardness: ReservationHardness.HARD,
          ...(warehouseId ? { warehouseId } : {}),
        },
        _sum: { qty: true },
      }),
      this.prisma.materialReservation.aggregate({
        where: {
          productId,
          status: ReservationStatus.ACTIVE,
          hardness: ReservationHardness.SOFT,
          ...(warehouseId ? { warehouseId } : {}),
        },
        _sum: { qty: true },
      }),
      this.prisma.productionBatch.aggregate({
        where: {
          productId,
          status: { in: [ProductionBatchStatus.DRAFT, ProductionBatchStatus.IN_PROGRESS] },
        },
        _sum: { qtyPlanned: true, qtyGood: true },
      }),
    ]);

    const physical = stockAgg._sum.qty ?? 0;
    const hardReserved = hardAgg._sum.qty ?? 0;
    const softReserved = softAgg._sum.qty ?? 0;
    const available = Math.max(0, physical - hardReserved);
    const expectedOutput = Math.max(0, (wipAgg._sum.qtyPlanned ?? 0) - (wipAgg._sum.qtyGood ?? 0));

    return {
      asOfSnapshotId: postedSnapshot.id,
      asOfSnapshotDate: postedSnapshot.postedAt ?? null,
      productId,
      warehouseId: warehouseId ?? null,
      physical,
      hardReserved,
      softReserved,
      available,
      expectedOutput,
    };
  }

  /** WIP qty at QC/PACK ready for final packaging (parts finishing, not kit assembly). */
  async getPackReadyByProduct(productIds?: string[]): Promise<Map<string, number>> {
    const [packStage, qcStage] = await Promise.all([
      this.prisma.productionStage.findUnique({
        where: { code: ProductionStageCode.PACK },
        select: { id: true },
      }),
      this.prisma.productionStage.findUnique({
        where: { code: ProductionStageCode.QC },
        select: { id: true },
      }),
    ]);
    const stageIds = [packStage?.id, qcStage?.id].filter((id): id is string => Boolean(id));
    if (stageIds.length === 0) return new Map();

    const wipBatches = await this.prisma.productionBatch.findMany({
      where: {
        status: { in: [ProductionBatchStatus.DRAFT, ProductionBatchStatus.IN_PROGRESS] },
        currentStageId: { in: stageIds },
        ...(productIds?.length ? { productId: { in: productIds } } : {}),
      },
      select: {
        productId: true,
        qtyPlanned: true,
        qtyGood: true,
      },
    });

    const packReadyByProduct = new Map<string, number>();
    for (const batch of wipBatches) {
      const remaining = Math.max(0, batch.qtyPlanned - batch.qtyGood);
      if (remaining <= 0) continue;
      packReadyByProduct.set(
        batch.productId,
        (packReadyByProduct.get(batch.productId) ?? 0) + remaining,
      );
    }
    return packReadyByProduct;
  }

  async getKitCapacity(kitProductId: string) {
    const bom = await this.prisma.kitBom.findFirst({
      where: { kitProductId, isActive: true },
      include: {
        lines: {
          include: { component: { select: { id: true, sku: true, name: true } } },
        },
      },
      orderBy: [{ effectiveFrom: "desc" }, { revision: "desc" }],
    });
    if (!bom || bom.lines.length === 0) {
      return { kitProductId, maxBuildNow: 0, bottleneckComponentId: null, components: [] };
    }

    const components: Array<{
      componentProductId: string;
      qtyPerKit: number;
      available: number;
      ratio: number;
      constrainsCapacity: boolean;
      product: { id: string; sku: string; name: string } | null;
    }> = [];
    for (const line of bom.lines) {
      const sku = line.component?.sku ?? "";
      const constrainsCapacity = constrainsKitCapacity({
        sku,
        name: line.component?.name,
      });
      const availability = constrainsCapacity
        ? await this.getAvailability(line.componentProductId)
        : { available: 0 };
      const scrap = line.scrapPct?.toNumber() ?? 0;
      const effectiveQtyPerKit = line.qtyPerKit.toNumber() * (1 + scrap / 100);
      const ratio =
        constrainsCapacity && effectiveQtyPerKit > 0
          ? availability.available / effectiveQtyPerKit
          : Number.POSITIVE_INFINITY;
      components.push({
        componentProductId: line.componentProductId,
        qtyPerKit: line.qtyPerKit.toNumber(),
        available: availability.available,
        ratio,
        constrainsCapacity,
        product: line.component
          ? { id: line.component.id, sku: line.component.sku, name: line.component.name }
          : null,
      });
    }

    const constraining = components
      .filter((c) => c.constrainsCapacity)
      .sort((a, b) => a.ratio - b.ratio);
    const bottleneck = constraining[0] ?? null;
    // Keep PKG lines in the response (UI/debug) but sort constraining first by ratio.
    const enriched = [
      ...constraining,
      ...components.filter((c) => !c.constrainsCapacity),
    ].map((c) => ({
      ...c,
      ratio: Number.isFinite(c.ratio) ? c.ratio : 0,
    }));
    return {
      kitProductId,
      maxBuildNow: bottleneck ? Math.max(0, Math.floor(bottleneck.ratio)) : 0,
      bottleneckComponentId: bottleneck?.componentProductId ?? null,
      components: enriched,
    };
  }

  async getDemandByProduct(): Promise<Map<string, { hard: number; soft: number }>> {
    const rules = await this.demandRules.getRules();
    const stages = [...new Set([...rules.hardStages, ...rules.softStages])];
    return this.aggregateDemandByProduct(stages, rules);
  }

  /** Hard demand for pack-cycle need — excludes READY_TO_SHIP (reserved for ship, not assembly). */
  async getPackDemandByProduct(): Promise<Map<string, { hard: number; soft: number }>> {
    const rules = await this.demandRules.getRules();
    const packHardStages = rules.hardStages.filter((s) => s !== OrderStage.READY_TO_SHIP);
    const stages = [...new Set([...packHardStages, ...rules.softStages])];
    return this.aggregateDemandByProduct(stages, rules, packHardStages);
  }

  private async aggregateDemandByProduct(
    stages: OrderStage[],
    rules: Awaited<ReturnType<DemandRulesService["getRules"]>>,
    hardStages: OrderStage[] = rules.hardStages,
  ): Promise<Map<string, { hard: number; soft: number }>> {
    const demandRows = await this.prisma.orderItem.findMany({
      where: {
        productId: { not: null },
        order: {
          orderStage: {
            in: stages,
            notIn: ["CANCELED", "REFUSED", "COMPLETED"],
          },
        },
      },
      include: { order: { select: { orderStage: true } } },
    });
    const map = new Map<string, { hard: number; soft: number }>();
    for (const row of demandRows) {
      if (!row.productId) continue;
      const remaining = Math.max(0, row.qty - row.qtyShipped);
      const current = map.get(row.productId) ?? { hard: 0, soft: 0 };
      const isHard = row.order.orderStage && hardStages.includes(row.order.orderStage);
      if (isHard) current.hard += remaining;
      else current.soft += remaining;
      map.set(row.productId, current);
    }
    return map;
  }

  async getHardDemandByProduct(): Promise<Map<string, number>> {
    const demand = await this.getDemandByProduct();
    return new Map([...demand.entries()].map(([id, v]) => [id, v.hard]));
  }

  async getLaunchRecommendations(horizonWeeks = 1) {
    const rules = await this.demandRules.getRules();
    const now = new Date();
    const until = new Date(now);
    until.setDate(until.getDate() + horizonWeeks * 7);
    const lookbackFrom = new Date(now);
    lookbackFrom.setDate(lookbackFrom.getDate() - 90);

    const demandRows = await this.prisma.orderItem.findMany({
      where: {
        order: {
          createdAt: { gte: lookbackFrom, lte: until },
          orderStage: {
            in: [...rules.hardStages, ...rules.softStages],
            notIn: ["CANCELED", "REFUSED", "COMPLETED"],
          },
        },
      },
      include: { order: { select: { id: true, orderStage: true } } },
    });

    const demandByProduct = new Map<string, { hard: number; soft: number }>();
    const unresolvedOrderItemIds: string[] = [];

    for (const row of demandRows) {
      if (!row.productId) {
        if (rules.includeOrderItemsWithoutProductIdAsSoft) unresolvedOrderItemIds.push(row.id);
        continue;
      }
      const current = demandByProduct.get(row.productId) ?? { hard: 0, soft: 0 };
      const isHard = row.order.orderStage && rules.hardStages.includes(row.order.orderStage);
      const remainingQty = Math.max(0, row.qty - row.qtyShipped);
      if (isHard) current.hard += remainingQty;
      else current.soft += remainingQty;
      demandByProduct.set(row.productId, current);
    }

    const recommendations = [];
    for (const [productId, demand] of demandByProduct.entries()) {
      const availability = await this.getAvailability(productId);
      const hardNeed = demand.hard;
      const deficit = Math.max(0, hardNeed - availability.available - availability.expectedOutput);
      if (deficit > 0) {
        recommendations.push({
          productId,
          hardNeed,
          softNeed: demand.soft,
          available: availability.available,
          expectedOutput: availability.expectedOutput,
          deficit,
          suggestedLaunchQty: deficit,
          reason: "Legacy WIP: hard demand exceeds stock + expected output (prefer Factory / Packing tabs)",
          horizonWeeks,
        });
      }
    }

    recommendations.sort((a, b) => b.deficit - a.deficit);

    const recProductIds = [...new Set(recommendations.map((r) => r.productId))];
    const recProducts = await this.prisma.product.findMany({
      where: { id: { in: recProductIds } },
      select: { id: true, sku: true, name: true },
    });
    const recById = new Map(recProducts.map((p) => [p.id, { sku: p.sku, name: p.name }]));

    return {
      horizonWeeks,
      unresolvedOrderItemIds,
      recommendations: recommendations.map((r) => ({
        ...r,
        product: recById.get(r.productId) ?? null,
      })),
    };
  }

  async getSnapshotFreshness() {
    const settings = await this.settings.getSettings();
    const posted = await this.prisma.inventorySnapshot.findFirst({
      where: { status: InventorySnapshotStatus.POSTED },
      orderBy: { postedAt: "desc" },
    });
    return evaluateSnapshotFreshness(posted, settings.snapshotMaxAgeDays);
  }

  async getSalesFreshness() {
    return this.demandForecast.evaluateSalesFreshnessWithCoverage();
  }

  async getPlanningFreshness() {
    const [snapshot, sales, latestRun] = await Promise.all([
      this.getSnapshotFreshness(),
      this.getSalesFreshness(),
      this.prisma.planningRun.findFirst({
        where: { mode: "FULL" },
        orderBy: { computedAt: "desc" },
        select: { computedAt: true },
      }),
    ]);
    let mrpStale = false;
    let mrpStaleWarning: string | null = null;
    const inputTimes = [snapshot.postedAt, sales.postedAt]
      .filter((d): d is Date => d instanceof Date)
      .map((d) => d.getTime());
    if (latestRun && inputTimes.length > 0) {
      const newestInput = Math.max(...inputTimes);
      if (latestRun.computedAt.getTime() < newestInput) {
        mrpStale = true;
        mrpStaleWarning =
          "MRP run is older than the latest snapshot or sales upload. Recalculate MRP.";
      }
    }
    return { snapshot, sales, mrpStale, mrpStaleWarning };
  }

  async getDashboardSummary() {
    const settings = await this.settings.getSettings();
    const freshness = await this.getSnapshotFreshness();
    const [forecast14Map, forecast30Map, hardDemand, kits, draftPack, approvedPack, openFactory] =
      await Promise.all([
        this.demandForecast.getForecastQtyMap(14),
        this.demandForecast.getForecastQtyMap(30),
        this.getHardDemandByProduct(),
        this.prisma.product.findMany({
          where: { kind: ProductKind.KIT, isActive: true },
          select: { id: true, sku: true, name: true },
        }),
        this.prisma.packingList.findFirst({
          where: { status: PackingListStatus.DRAFT },
          orderBy: { cycleStart: "desc" },
          include: { _count: { select: { lines: true } } },
        }),
        this.prisma.packingList.findFirst({
          where: { status: PackingListStatus.APPROVED },
          orderBy: { cycleStart: "desc" },
          include: { _count: { select: { lines: true } } },
        }),
        this.prisma.factoryOrder.count({
          where: { status: { in: [FactoryOrderStatus.OPEN, FactoryOrderStatus.PARTIAL] } },
        }),
      ]);

    let totalKitStock = 0;
    let totalWeeklyDemand = 0;
    let bottleneckRisks = 0;
    const coverRows: Array<{
      productId: string;
      sku: string;
      name: string;
      stock: number;
      weeklyDemand: number;
      daysOfCover: number | null;
      maxBuildNow: number;
      bottleneckComponentId: string | null;
    }> = [];

    for (const kit of kits) {
      const avail = await this.getAvailability(kit.id);
      const forecast14 = forecast14Map.get(kit.id) ?? 0;
      const forecast30 = forecast30Map.get(kit.id) ?? 0;
      const hard = hardDemand.get(kit.id) ?? 0;
      const weekly =
        forecast14 > 0
          ? forecast14 / 2
          : forecast30 > 0
            ? forecast30 / (30 / 7)
            : hard / 2;
      totalKitStock += avail.available;
      totalWeeklyDemand += weekly;
      const daysOfCover = weekly > 0 ? Math.round((avail.available / weekly) * 7 * 10) / 10 : null;
      const capacity = await this.getKitCapacity(kit.id);
      if (capacity.maxBuildNow === 0 && (hardDemand.get(kit.id) ?? 0) > 0) bottleneckRisks += 1;
      coverRows.push({
        productId: kit.id,
        sku: kit.sku,
        name: kit.name,
        stock: avail.available,
        weeklyDemand: Math.round(weekly * 10) / 10,
        daysOfCover,
        maxBuildNow: capacity.maxBuildNow,
        bottleneckComponentId: capacity.bottleneckComponentId,
      });
    }

    coverRows.sort((a, b) => (a.daysOfCover ?? 9999) - (b.daysOfCover ?? 9999));
    const overallDaysOfCover =
      totalWeeklyDemand > 0 ? Math.round((totalKitStock / totalWeeklyDemand) * 7 * 10) / 10 : null;

    return {
      settings,
      freshness,
      overallDaysOfCover,
      packCycleDays: settings.packCycleDays,
      packCapacityPerCycle: settings.packCapacityPerCycle,
      latestDraftPacking: draftPack,
      latestApprovedPacking: approvedPack,
      openFactoryOrders: openFactory,
      bottleneckRiskCount: bottleneckRisks,
      kitCoverage: coverRows.slice(0, 50),
    };
  }

  /**
   * Deterministic projection: apply approved packing (kits↑ parts↓) and open factory PO (parts↑ at lead week),
   * then burn weekly kit forecast only (parts already consumed at pack time — no second BOM explode).
   */
  async getStockProjection(weeks: number[] = [2, 4, 8, 12]) {
    const settings = await this.settings.getSettings();
    const freshness = await this.getSnapshotFreshness();
    const forecast14Map = await this.demandForecast.getForecastQtyMap(14);
    const weeklyKitDemand = new Map(
      [...forecast14Map.entries()].map(([id, qty]) => [id, qty / 2]),
    );

    const kits = await this.prisma.product.findMany({
      where: { kind: ProductKind.KIT, isActive: true },
      select: { id: true },
    });
    const parts = await this.prisma.product.findMany({
      where: { kind: ProductKind.PART, isActive: true },
      select: { id: true },
    });

    const kitStock = new Map<string, number>();
    const partStock = new Map<string, number>();
    for (const kit of kits) {
      kitStock.set(kit.id, (await this.getAvailability(kit.id)).available);
    }
    for (const part of parts) {
      partStock.set(part.id, (await this.getAvailability(part.id)).available);
    }

    const postedSnapshot = await this.prisma.inventorySnapshot.findFirst({
      where: { status: InventorySnapshotStatus.POSTED },
      orderBy: { postedAt: "desc" },
      select: { postedAt: true },
    });

    const approvedPack = await this.prisma.packingList.findMany({
      where: {
        status: PackingListStatus.APPROVED,
        // Only packs approved after the posted snapshot still need projection —
        // older packs should already be reflected in 1C stock.
        ...(postedSnapshot?.postedAt
          ? {
              OR: [
                { approvedAt: { gt: postedSnapshot.postedAt } },
                { approvedAt: null, createdAt: { gt: postedSnapshot.postedAt } },
              ],
            }
          : {}),
      },
      include: { lines: true },
    });
    for (const list of approvedPack) {
      for (const line of list.lines) {
        kitStock.set(line.kitProductId, (kitStock.get(line.kitProductId) ?? 0) + line.qtyApproved);
        const bom = await this.prisma.kitBom.findFirst({
          where: { kitProductId: line.kitProductId, isActive: true },
          include: {
            lines: { include: { component: { select: { sku: true, name: true } } } },
          },
        });
        if (!bom) continue;
        for (const bl of bom.lines) {
          if (!constrainsKitCapacity({ sku: bl.component?.sku, name: bl.component?.name })) continue;
          const use = line.qtyApproved * bl.qtyPerKit.toNumber();
          partStock.set(bl.componentProductId, (partStock.get(bl.componentProductId) ?? 0) - use);
        }
      }
    }

    const openPo = await this.prisma.factoryOrderLine.findMany({
      where: {
        factoryOrder: {
          status: { in: [FactoryOrderStatus.OPEN, FactoryOrderStatus.PARTIAL] },
        },
      },
    });
    const inboundByPart = new Map<string, number>();
    for (const line of openPo) {
      inboundByPart.set(
        line.partProductId,
        (inboundByPart.get(line.partProductId) ?? 0) + Math.max(0, line.qtyOrdered - line.qtyReceived),
      );
    }

    const receiptWeek = Math.max(1, Math.floor(settings.factoryLeadTimeDays / 7));
    const maxWeek = Math.max(...weeks, 0);
    const points: Array<{
      week: number;
      kitsTotal: number;
      partsTotal: number;
      kitDaysOfCover: number | null;
    }> = [];

    const weeklyDemandTotal = [...weeklyKitDemand.values()].reduce((a, b) => a + b, 0);

    for (let w = 1; w <= maxWeek; w += 1) {
      for (const [kitId, weekly] of weeklyKitDemand.entries()) {
        kitStock.set(kitId, (kitStock.get(kitId) ?? 0) - weekly);
      }
      if (w === receiptWeek) {
        for (const [partId, qty] of inboundByPart.entries()) {
          partStock.set(partId, (partStock.get(partId) ?? 0) + qty);
        }
      }
      if (weeks.includes(w)) {
        const kitsTotal = Math.round(
          [...kitStock.values()].reduce((a, b) => a + Math.max(0, b), 0),
        );
        const partsTotal = Math.round(
          [...partStock.values()].reduce((a, b) => a + Math.max(0, b), 0),
        );
        points.push({
          week: w,
          kitsTotal,
          partsTotal,
          kitDaysOfCover:
            weeklyDemandTotal > 0
              ? Math.round((kitsTotal / weeklyDemandTotal) * 7 * 10) / 10
              : null,
        });
      }
    }

    return { freshness, receiptWeek, points };
  }
}

