import { Injectable } from "@nestjs/common";
import {
  InventorySnapshotStatus,
  PlanningRunLineType,
  PlanningRunMode,
  ProductKind,
  ProductionBatchStatus,
  ProductionStageCode,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { isNonInventoriedPackagingSku } from "./bom-part.util";
import { DemandForecastService } from "./demand-forecast.service";
import { MrpConfigService } from "./mrp-config.service";
import { allocateMonthlyQuota, coverDays, coverStatus } from "./mrp-quota.util";
import { PlanningCalculationService } from "./planning-calculation.service";
import { evaluateSnapshotFreshness } from "./snapshot-freshness.util";
import { PlanningSettingsService } from "./planning-settings.service";

export type MrpDraftLine = {
  productId: string;
  sku: string;
  name: string;
  kind: ProductKind;
  lineType: PlanningRunLineType;
  qty: number;
  suggestedLaunchQty: number;
  priority: number;
  monthBucket: number | null;
  coverDays: number | null;
  reason: string | null;
  details: Record<string, unknown>;
};

export type MrpCalculationResult = {
  mode: PlanningRunMode;
  coverMonths: number;
  monthlyPartsQuota: number;
  velocityLookbackMonths: number;
  snapshotId: string | null;
  freshness: ReturnType<typeof evaluateSnapshotFreshness>;
  lines: MrpDraftLine[];
  summary: {
    criticalCount: number;
    productionCount: number;
    packCount: number;
    semiCount: number;
    canPackCount: number;
    quotaUsedMonth0: number;
    quotaOverflowCount: number;
  };
};

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  kind: ProductKind;
};

@Injectable()
export class MrpCalculationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mrpConfig: MrpConfigService,
    private readonly demandForecast: DemandForecastService,
    private readonly calculations: PlanningCalculationService,
    private readonly planningSettings: PlanningSettingsService,
  ) {}

  async calculate(mode: PlanningRunMode = PlanningRunMode.FULL): Promise<MrpCalculationResult> {
    const [capacity, horizon, settings] = await Promise.all([
      this.mrpConfig.getCapacity(),
      this.mrpConfig.getHorizon(),
      this.planningSettings.getSettings(),
    ]);

    const posted = await this.prisma.inventorySnapshot.findFirst({
      where: { status: InventorySnapshotStatus.POSTED },
      orderBy: { postedAt: "desc" },
      select: { id: true, postedAt: true },
    });
    const freshness = evaluateSnapshotFreshness(posted, settings.snapshotMaxAgeDays);

    const allParams = await this.prisma.planningProductParams.findMany({
      select: {
        productId: true,
        safetyStock: true,
        productionLeadDays: true,
        packLeadDays: true,
        monthlyForecastOverride: true,
        isPlanned: true,
      },
    });
    const paramsByProduct = new Map(allParams.map((p) => [p.productId, p]));
    const unplannedIds = new Set(allParams.filter((p) => !p.isPlanned).map((p) => p.productId));

    // Planned products = active KIT/PART (unless explicitly unplanned) + explicitly planned others.
    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        OR: [
          { kind: { in: [ProductKind.KIT, ProductKind.PART] } },
          { id: { in: allParams.filter((p) => p.isPlanned).map((p) => p.productId) } },
        ],
      },
      select: { id: true, sku: true, name: true, kind: true },
    });
    const productById = new Map(products.map((p) => [p.id, p]));
    const plannedIds = products.filter((p) => !unplannedIds.has(p.id)).map((p) => p.id);

    const forecastMap = await this.demandForecast.getDemandForecastMap(plannedIds);

    const packStage = await this.prisma.productionStage.findUnique({
      where: { code: ProductionStageCode.PACK },
      select: { id: true },
    });
    const qcStage = await this.prisma.productionStage.findUnique({
      where: { code: ProductionStageCode.QC },
      select: { id: true },
    });

    const wipBatches = await this.prisma.productionBatch.findMany({
      where: {
        status: { in: [ProductionBatchStatus.DRAFT, ProductionBatchStatus.IN_PROGRESS] },
        productId: { in: plannedIds },
      },
      select: {
        id: true,
        productId: true,
        qtyPlanned: true,
        qtyGood: true,
        currentStageId: true,
      },
    });

    const wipByProduct = new Map<string, number>();
    const packReadyByPart = new Map<string, number>();
    for (const b of wipBatches) {
      const remaining = Math.max(0, b.qtyPlanned - b.qtyGood);
      wipByProduct.set(b.productId, (wipByProduct.get(b.productId) ?? 0) + remaining);
      if (
        remaining > 0 &&
        (b.currentStageId === packStage?.id || b.currentStageId === qcStage?.id)
      ) {
        packReadyByPart.set(b.productId, (packReadyByPart.get(b.productId) ?? 0) + remaining);
      }
    }

    const activeBoms = await this.prisma.kitBom.findMany({
      where: { isActive: true, kitProductId: { in: plannedIds } },
      include: {
        lines: { include: { component: { select: { sku: true } } } },
      },
      orderBy: [{ effectiveFrom: "desc" }, { revision: "desc" }],
    });
    const bomByKit = new Map<string, (typeof activeBoms)[number]>();
    for (const bom of activeBoms) {
      if (!bomByKit.has(bom.kitProductId)) bomByKit.set(bom.kitProductId, bom);
    }

    const packNorms = await this.prisma.stageTimeNorm.findMany({
      where: packStage ? { stageId: packStage.id } : undefined,
      select: { productId: true, expectedDurationHours: true },
    });
    const packLeadByProduct = new Map<string, number>();
    for (const n of packNorms) {
      if (!n.productId) continue;
      packLeadByProduct.set(n.productId, Math.ceil(n.expectedDurationHours / 24));
    }

    type SkuCalc = {
      product: ProductRow;
      available: number;
      expectedWip: number;
      hardNeed: number;
      softNeed: number;
      forecastDemand: number;
      safetyStock: number;
      grossNeed: number;
      netNeed: number;
      avgDailySold: number;
      coverDays: number;
      status: "OK" | "WARN" | "CRITICAL";
      productionLeadDays: number;
      packLeadDays: number;
      hasBom: boolean;
      missingBom: boolean;
    };

    const calcs: SkuCalc[] = [];
    for (const productId of plannedIds) {
      const product = productById.get(productId);
      if (!product) continue;
      const params = paramsByProduct.get(productId);
      // Skip explicitly unplanned
      if (params && params.isPlanned === false) continue;

      const availability = await this.calculations.getAvailability(productId);
      const forecast = forecastMap.get(productId);
      const hardNeed = forecast?.hardNeed ?? 0;
      const softNeed = forecast?.softNeed ?? 0;
      const forecastDemand = forecast?.forecastDemand ?? 0;
      const safetyStock = params?.safetyStock ?? Math.ceil((settings.safetyStockWeeks * 7) * (forecast?.avgDailySold ?? 0));
      const grossNeed = Math.max(hardNeed, forecastDemand) + safetyStock;
      const expectedWip = wipByProduct.get(productId) ?? availability.expectedOutput;
      const supply = availability.available + expectedWip;
      const netNeed = Math.max(0, Math.ceil(grossNeed - supply));
      const avgDailySold = forecast?.avgDailySold ?? 0;
      const days = coverDays(availability.available, avgDailySold);
      const status = coverStatus(days, horizon.warnCoverDays, horizon.criticalCoverDays);
      const productionLeadDays = params?.productionLeadDays ?? settings.factoryLeadTimeDays;
      const packLeadDays =
        params?.packLeadDays ??
        packLeadByProduct.get(productId) ??
        horizon.defaultPackLeadDays;
      const bom = bomByKit.get(productId);
      const hasBom = Boolean(bom && bom.lines.length > 0);
      const missingBom = product.kind === ProductKind.KIT && !hasBom;

      calcs.push({
        product,
        available: availability.available,
        expectedWip,
        hardNeed,
        softNeed,
        forecastDemand,
        safetyStock,
        grossNeed,
        netNeed,
        avgDailySold,
        coverDays: days,
        status,
        productionLeadDays,
        packLeadDays,
        hasBom,
        missingBom,
      });
    }

    // Explode KIT net need into PART requirements.
    const partExtraNeed = new Map<string, number>();
    for (const row of calcs) {
      if (row.product.kind !== ProductKind.KIT || row.netNeed <= 0 || !row.hasBom) continue;
      const bom = bomByKit.get(row.product.id)!;
      for (const line of bom.lines) {
        if (isNonInventoriedPackagingSku(line.component?.sku)) continue;
        const per = line.qtyPerKit.toNumber();
        const scrap = line.scrapPct?.toNumber() ?? 0;
        const need = row.netNeed * per * (1 + scrap / 100);
        partExtraNeed.set(
          line.componentProductId,
          (partExtraNeed.get(line.componentProductId) ?? 0) + need,
        );
      }
    }

    const calcById = new Map(calcs.map((c) => [c.product.id, c]));
    for (const [partId, extra] of partExtraNeed) {
      const existing = calcById.get(partId);
      if (existing) {
        existing.netNeed = Math.max(existing.netNeed, Math.ceil(extra));
        existing.grossNeed = Math.max(existing.grossNeed, existing.netNeed + existing.available);
      } else {
        const product = productById.get(partId);
        if (!product) continue;
        const availability = await this.calculations.getAvailability(partId);
        const forecast = forecastMap.get(partId);
        const netNeed = Math.max(0, Math.ceil(extra - availability.available - (wipByProduct.get(partId) ?? 0)));
        const days = coverDays(availability.available, forecast?.avgDailySold ?? 0);
        const row: SkuCalc = {
          product,
          available: availability.available,
          expectedWip: wipByProduct.get(partId) ?? 0,
          hardNeed: forecast?.hardNeed ?? 0,
          softNeed: forecast?.softNeed ?? 0,
          forecastDemand: forecast?.forecastDemand ?? 0,
          safetyStock: 0,
          grossNeed: Math.ceil(extra),
          netNeed,
          avgDailySold: forecast?.avgDailySold ?? 0,
          coverDays: days,
          status: coverStatus(days, horizon.warnCoverDays, horizon.criticalCoverDays),
          productionLeadDays: settings.factoryLeadTimeDays,
          packLeadDays: horizon.defaultPackLeadDays,
          hasBom: false,
          missingBom: false,
        };
        calcs.push(row);
        calcById.set(partId, row);
      }
    }

    const lines: MrpDraftLine[] = [];
    const productionCandidates: Array<{
      key: string;
      productId: string;
      partsQty: number;
      priority: number;
      deficit: number;
      base: SkuCalc;
      reason: string;
    }> = [];

    for (const row of calcs) {
      const leadDays = row.productionLeadDays + row.packLeadDays;
      const coverRisk = row.coverDays < leadDays;
      const hardDeficitNoWip = row.hardNeed > row.available + row.expectedWip;

      if (row.status === "CRITICAL" || (coverRisk && hardDeficitNoWip) || (row.netNeed > 0 && coverRisk)) {
        lines.push(
          draftLine(row, PlanningRunLineType.CRITICAL, Math.max(row.netNeed, 1), {
            reason: row.status === "CRITICAL"
              ? `Cover ${Math.round(row.coverDays)}d < critical threshold`
              : coverRisk
                ? `Cover ${Math.round(row.coverDays)}d < lead time ${leadDays}d`
                : "Hard deficit without sufficient WIP",
            details: baseDetails(row, { leadDays, coverRisk, hardDeficitNoWip }),
            priority: row.status === "CRITICAL" ? 10 : 20,
          }),
        );
      }

      if (row.product.kind === ProductKind.PART) {
        const packReady = packReadyByPart.get(row.product.id) ?? 0;
        if (packReady > 0) {
          // Find kits that use this part for PACK suggestion context
          lines.push(
            draftLine(row, PlanningRunLineType.PACK, packReady, {
              reason: "WIP at QC/PACK ready for packaging",
              details: baseDetails(row, { packReady }),
              priority: 30,
              suggestedLaunchQty: packReady,
            }),
          );
        }

        if (row.netNeed > 0 || row.status !== "OK" || coverRisk) {
          if (row.coverDays < leadDays || row.status === "CRITICAL") {
            lines.push(
              draftLine(row, PlanningRunLineType.SEMI_REORDER, Math.max(row.netNeed, 1), {
                reason: "Part below safety / cover under lead time",
                details: baseDetails(row, { leadDays }),
                priority: row.status === "CRITICAL" ? 15 : 40,
                suggestedLaunchQty: Math.max(row.netNeed, 1),
              }),
            );
          }
        }
      }

      if (row.product.kind === ProductKind.KIT && row.hasBom) {
        const capacity = await this.calculations.getKitCapacity(row.product.id);
        if (capacity.maxBuildNow > 0) {
          lines.push(
            draftLine(row, PlanningRunLineType.CAN_PACK, capacity.maxBuildNow, {
              reason: "Parts on hand can assemble kit",
              details: {
                ...baseDetails(row),
                maxBuildNow: capacity.maxBuildNow,
                bottleneckComponentId: capacity.bottleneckComponentId,
              },
              priority: 50,
              suggestedLaunchQty: capacity.maxBuildNow,
            }),
          );
        }
      }

      if (row.netNeed > 0) {
        const priority =
          row.status === "CRITICAL" ? 10 : row.status === "WARN" ? 40 : 80;
        const partsQty =
          row.product.kind === ProductKind.PART
            ? row.netNeed
            : row.missingBom
              ? row.netNeed
              : bomPartsEquivalent(row.netNeed, bomByKit.get(row.product.id));

        productionCandidates.push({
          key: `${row.product.id}:PRODUCTION`,
          productId: row.product.id,
          partsQty,
          priority,
          deficit: row.netNeed,
          base: row,
          reason: row.missingBom
            ? "Net need (KIT without BOM counted as parts)"
            : "Net need within production lead horizon",
        });
      }
    }

    const quotaSlices = allocateMonthlyQuota(
      productionCandidates.map((c) => ({
        key: c.key,
        productId: c.productId,
        partsQty: c.partsQty,
        priority: c.priority,
        deficit: c.deficit,
      })),
      capacity.monthlyPartsQuota,
      Math.max(horizon.coverMonths + 1, 4),
    );
    const sliceByKey = new Map(quotaSlices.map((s) => [s.key, s]));

    for (const c of productionCandidates) {
      const slice = sliceByKey.get(c.key);
      lines.push(
        draftLine(c.base, PlanningRunLineType.PRODUCTION, c.deficit, {
          reason: c.reason,
          details: {
            ...baseDetails(c.base),
            partsQty: c.partsQty,
            month0Qty: slice?.month0Qty ?? 0,
            overflowed: slice?.overflowed ?? true,
            quotaSuggested: slice?.suggestedLaunchQty ?? 0,
          },
          priority: c.priority,
          suggestedLaunchQty: slice?.suggestedLaunchQty ?? 0,
          monthBucket: slice?.monthBucket ?? null,
        }),
      );
    }

    let filtered = lines;
    if (mode === PlanningRunMode.CRITICAL) {
      filtered = lines.filter(
        (l) =>
          l.lineType === PlanningRunLineType.CRITICAL ||
          l.lineType === PlanningRunLineType.SEMI_REORDER ||
          (l.lineType === PlanningRunLineType.PRODUCTION && l.priority <= 20),
      );
    }

    filtered.sort((a, b) => a.priority - b.priority || b.qty - a.qty);

    const quotaUsedMonth0 = filtered
      .filter((l) => l.lineType === PlanningRunLineType.PRODUCTION)
      .reduce((sum, l) => sum + (Number(l.details.month0Qty) || 0), 0);
    const quotaOverflowCount = filtered.filter(
      (l) => l.lineType === PlanningRunLineType.PRODUCTION && l.details.overflowed === true,
    ).length;

    return {
      mode,
      coverMonths: horizon.coverMonths,
      monthlyPartsQuota: capacity.monthlyPartsQuota,
      velocityLookbackMonths: horizon.velocityLookbackMonths,
      snapshotId: posted?.id ?? null,
      freshness,
      lines: filtered,
      summary: {
        criticalCount: filtered.filter((l) => l.lineType === PlanningRunLineType.CRITICAL).length,
        productionCount: filtered.filter((l) => l.lineType === PlanningRunLineType.PRODUCTION).length,
        packCount: filtered.filter((l) => l.lineType === PlanningRunLineType.PACK).length,
        semiCount: filtered.filter((l) => l.lineType === PlanningRunLineType.SEMI_REORDER).length,
        canPackCount: filtered.filter((l) => l.lineType === PlanningRunLineType.CAN_PACK).length,
        quotaUsedMonth0,
        quotaOverflowCount,
      },
    };
  }
}

function bomPartsEquivalent(
  kitQty: number,
  bom:
    | {
        lines: Array<{
          qtyPerKit: { toNumber(): number };
          scrapPct: { toNumber(): number } | null;
          component?: { sku: string } | null;
        }>;
      }
    | undefined,
): number {
  if (!bom || bom.lines.length === 0) return kitQty;
  let parts = 0;
  let counted = 0;
  for (const line of bom.lines) {
    if (isNonInventoriedPackagingSku(line.component?.sku)) continue;
    const per = line.qtyPerKit.toNumber();
    const scrap = line.scrapPct?.toNumber() ?? 0;
    parts += kitQty * per * (1 + scrap / 100);
    counted += 1;
  }
  return counted > 0 ? Math.ceil(parts) : kitQty;
}

function baseDetails(row: {
  available: number;
  expectedWip: number;
  hardNeed: number;
  softNeed: number;
  forecastDemand: number;
  safetyStock: number;
  grossNeed: number;
  netNeed: number;
  avgDailySold: number;
  coverDays: number;
  status: string;
  productionLeadDays: number;
  packLeadDays: number;
  missingBom: boolean;
}, extra: Record<string, unknown> = {}) {
  return {
    available: row.available,
    expectedWip: row.expectedWip,
    hardNeed: row.hardNeed,
    softNeed: row.softNeed,
    forecastDemand: Math.round(row.forecastDemand * 100) / 100,
    safetyStock: row.safetyStock,
    grossNeed: Math.round(row.grossNeed * 100) / 100,
    netNeed: row.netNeed,
    avgDailySold: Math.round(row.avgDailySold * 1000) / 1000,
    coverDays: Math.round(row.coverDays * 10) / 10,
    status: row.status,
    productionLeadDays: row.productionLeadDays,
    packLeadDays: row.packLeadDays,
    missingBom: row.missingBom,
    ...extra,
  };
}

function draftLine(
  row: { product: ProductRow; coverDays: number },
  lineType: PlanningRunLineType,
  qty: number,
  opts: {
    reason: string;
    details: Record<string, unknown>;
    priority: number;
    suggestedLaunchQty?: number;
    monthBucket?: number | null;
  },
): MrpDraftLine {
  return {
    productId: row.product.id,
    sku: row.product.sku,
    name: row.product.name,
    kind: row.product.kind,
    lineType,
    qty: Math.max(0, Math.ceil(qty)),
    suggestedLaunchQty: opts.suggestedLaunchQty ?? Math.max(0, Math.ceil(qty)),
    priority: opts.priority,
    monthBucket: opts.monthBucket ?? null,
    coverDays: Math.round(row.coverDays * 10) / 10,
    reason: opts.reason,
    details: opts.details,
  };
}
