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
import { constrainsKitCapacity, isNonInventoriedPackagingSku } from "./bom-part.util";
import { DemandForecastService } from "./demand-forecast.service";
import { MrpConfigService } from "./mrp-config.service";
import { allocateMonthlyQuota } from "./mrp-quota.util";
import {
  computeOwnGrossNeed,
  criticalLineQty,
  isCoverRisk,
  recomputeNetNeed,
  resolveCoverMetrics,
  shouldEmitCritical,
} from "./mrp-sku-calc.util";
import { PlanningCalculationService } from "./planning-calculation.service";
import { evaluateSnapshotFreshness } from "./snapshot-freshness.util";
import { effectiveSafetyStock } from "./planning-safety.util";
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
  salesFreshness: Awaited<ReturnType<DemandForecastService["evaluateSalesFreshnessWithCoverage"]>>;
  salesUploadId: string | null;
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

type SkuCalc = {
  product: ProductRow;
  available: number;
  expectedWip: number;
  hardNeed: number;
  softNeed: number;
  forecastDemand: number;
  safetyStock: number;
  ownGrossNeed: number;
  kitDependentGross: number;
  grossNeed: number;
  netNeed: number;
  avgDailySold: number;
  coverDays: number | null;
  status: "OK" | "WARN" | "CRITICAL";
  hardDeficitQty: number;
  productionLeadDays: number;
  packLeadDays: number;
  hasBom: boolean;
  missingBom: boolean;
  velocitySource: string;
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

    const salesFreshness = await this.demandForecast.evaluateSalesFreshnessWithCoverage();

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
    // PKG:* packaging is not inventoried — exclude from planning set entirely.
    const plannedIds = products
      .filter((p) => !unplannedIds.has(p.id) && !isNonInventoriedPackagingSku(p.sku))
      .map((p) => p.id);

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
        lines: { include: { component: { select: { sku: true, name: true } } } },
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

    const calcs: SkuCalc[] = [];
    for (const productId of plannedIds) {
      const product = productById.get(productId);
      if (!product) continue;
      const params = paramsByProduct.get(productId);
      if (params && params.isPlanned === false) continue;

      const availability = await this.calculations.getAvailability(productId);
      const forecast = forecastMap.get(productId);
      const hardNeed = forecast?.hardNeed ?? 0;
      const softNeed = forecast?.softNeed ?? 0;
      const forecastDemand = forecast?.forecastDemand ?? 0;
      const avgMonthlySold = forecast?.avgMonthlySold ?? 0;
      const avgDailySold = forecast?.avgDailySold ?? 0;
      const velocitySource = forecast?.velocitySource ?? "sales_history";
      const safetyStock = effectiveSafetyStock(
        params?.safetyStock,
        avgMonthlySold,
        horizon.safetyMonths,
      );
      const ownGrossNeed = computeOwnGrossNeed(
        settings.demandMix,
        hardNeed,
        forecastDemand,
        softNeed,
        safetyStock,
        horizon.softPipelineFactor,
      );
      const expectedWip = wipByProduct.get(productId) ?? availability.expectedOutput;
      const { grossNeed, netNeed } = recomputeNetNeed(ownGrossNeed, 0, availability.available, expectedWip);
      const cover = resolveCoverMetrics({
        available: availability.available,
        avgDailySold,
        hardNeed,
        expectedWip,
        warnCoverDays: horizon.warnCoverDays,
        criticalCoverDays: horizon.criticalCoverDays,
      });
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
        ownGrossNeed,
        kitDependentGross: 0,
        grossNeed,
        netNeed,
        avgDailySold,
        coverDays: cover.coverDays,
        status: cover.status,
        hardDeficitQty: cover.hardDeficitQty,
        productionLeadDays,
        packLeadDays,
        hasBom,
        missingBom,
        velocitySource,
      });
    }

    // Explode KIT net need into PART dependent gross (not net).
    const partKitDependent = new Map<string, number>();
    for (const row of calcs) {
      if (row.product.kind !== ProductKind.KIT || row.netNeed <= 0 || !row.hasBom) continue;
      const bom = bomByKit.get(row.product.id)!;
      for (const line of bom.lines) {
        if (!constrainsKitCapacity({ sku: line.component?.sku, name: line.component?.name })) continue;
        const per = line.qtyPerKit.toNumber();
        const scrap = line.scrapPct?.toNumber() ?? 0;
        const need = row.netNeed * per * (1 + scrap / 100);
        partKitDependent.set(
          line.componentProductId,
          (partKitDependent.get(line.componentProductId) ?? 0) + need,
        );
      }
    }

    const calcById = new Map(calcs.map((c) => [c.product.id, c]));
    for (const [partId, kitDependentGross] of partKitDependent) {
      const existing = calcById.get(partId);
      if (existing) {
        existing.kitDependentGross += kitDependentGross;
        const recomputed = recomputeNetNeed(
          existing.ownGrossNeed,
          existing.kitDependentGross,
          existing.available,
          existing.expectedWip,
        );
        existing.grossNeed = recomputed.grossNeed;
        existing.netNeed = recomputed.netNeed;
        const cover = resolveCoverMetrics({
          available: existing.available,
          avgDailySold: existing.avgDailySold,
          hardNeed: existing.hardNeed,
          expectedWip: existing.expectedWip,
          warnCoverDays: horizon.warnCoverDays,
          criticalCoverDays: horizon.criticalCoverDays,
        });
        existing.coverDays = cover.coverDays;
        existing.status = cover.status;
        existing.hardDeficitQty = cover.hardDeficitQty;
        continue;
      }

      const product = productById.get(partId);
      if (!product || !constrainsKitCapacity({ sku: product.sku, name: product.name })) continue;

      const availability = await this.calculations.getAvailability(partId);
      const forecast = forecastMap.get(partId);
      const hardNeed = forecast?.hardNeed ?? 0;
      const softNeed = forecast?.softNeed ?? 0;
      const forecastDemand = forecast?.forecastDemand ?? 0;
      const avgDailySold = forecast?.avgDailySold ?? 0;
      const expectedWip = wipByProduct.get(partId) ?? availability.expectedOutput;
      const ownGrossNeed = computeOwnGrossNeed(
        settings.demandMix,
        hardNeed,
        forecastDemand,
        softNeed,
        0,
        horizon.softPipelineFactor,
      );
      const recomputed = recomputeNetNeed(
        ownGrossNeed,
        kitDependentGross,
        availability.available,
        expectedWip,
      );
      const cover = resolveCoverMetrics({
        available: availability.available,
        avgDailySold,
        hardNeed,
        expectedWip,
        warnCoverDays: horizon.warnCoverDays,
        criticalCoverDays: horizon.criticalCoverDays,
      });
      const row: SkuCalc = {
        product,
        available: availability.available,
        expectedWip,
        hardNeed,
        softNeed,
        forecastDemand,
        safetyStock: 0,
        ownGrossNeed,
        kitDependentGross,
        grossNeed: recomputed.grossNeed,
        netNeed: recomputed.netNeed,
        avgDailySold,
        coverDays: cover.coverDays,
        status: cover.status,
        hardDeficitQty: cover.hardDeficitQty,
        productionLeadDays: settings.factoryLeadTimeDays,
        packLeadDays: horizon.defaultPackLeadDays,
        hasBom: false,
        missingBom: false,
        velocitySource: forecast?.velocitySource ?? "sales_history",
      };
      calcs.push(row);
      calcById.set(partId, row);
    }

    const lines: MrpDraftLine[] = [];
    /** One PRODUCTION launch per product (PART and KIT). No parallel SEMI_REORDER. */
    const launchCandidates: Array<{
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
      const coverRisk = isCoverRisk(row.coverDays, leadDays);

      if (
        shouldEmitCritical({
          status: row.status,
          netNeed: row.netNeed,
          coverRisk,
          hardDeficitQty: row.hardDeficitQty,
        })
      ) {
        const qty = criticalLineQty(row.netNeed, row.hardDeficitQty);
        lines.push(
          draftLine(row, PlanningRunLineType.CRITICAL, qty, {
            reason:
              row.status === "CRITICAL" && row.coverDays != null
                ? `Cover ${Math.round(row.coverDays)}d < critical threshold`
                : coverRisk
                  ? `Cover ${Math.round(row.coverDays ?? 0)}d < lead time ${leadDays}d`
                  : "Hard deficit without sufficient WIP",
            details: baseDetails(row, {
              leadDays,
              coverRisk,
              hardDeficitNoWip: row.hardDeficitQty > 0,
              kitDependentGross: row.kitDependentGross,
              ownGrossNeed: row.ownGrossNeed,
            }),
            priority: row.status === "CRITICAL" ? 10 : 20,
          }),
        );
      }

      if (row.product.kind === ProductKind.PART) {
        const packReady = packReadyByPart.get(row.product.id) ?? 0;
        if (packReady > 0) {
          lines.push(
            draftLine(row, PlanningRunLineType.PACK, packReady, {
              reason: "WIP at QC/PACK ready for packaging",
              details: baseDetails(row, { packReady }),
              priority: 30,
              suggestedLaunchQty: packReady,
            }),
          );
        }

      }

      if (row.product.kind === ProductKind.KIT && row.hasBom) {
        const kitCapacity = await this.calculations.getKitCapacity(row.product.id);
        const bottleneckSku = kitCapacity.components.find(
          (c) => c.componentProductId === kitCapacity.bottleneckComponentId,
        )?.product?.sku;
        const unmetPackNeed = Math.max(0, Math.ceil(row.netNeed));
        const packDetails = {
          ...baseDetails(row),
          maxBuildNow: kitCapacity.maxBuildNow,
          unmetPackNeed,
          packNeed: unmetPackNeed,
          bottleneckComponentId: kitCapacity.bottleneckComponentId,
          bottleneckSku: bottleneckSku ?? null,
        };
        if (unmetPackNeed > 0) {
          lines.push(
            draftLine(row, PlanningRunLineType.PACK, unmetPackNeed, {
              reason: "Pack need from forecast and pipeline",
              details: packDetails,
              priority: 35,
              suggestedLaunchQty: unmetPackNeed,
            }),
          );
        }
        const packQty = Math.min(kitCapacity.maxBuildNow, unmetPackNeed);
        if (packQty > 0 && kitCapacity.maxBuildNow > 0) {
          lines.push(
            draftLine(row, PlanningRunLineType.CAN_PACK, packQty, {
              reason: "Feasible kit assembly from inventoried parts",
              details: packDetails,
              priority: 50,
              suggestedLaunchQty: packQty,
            }),
          );
        }
      }

      if (row.netNeed > 0) {
        const priority =
          row.status === "CRITICAL" ? 10 : row.status === "WARN" ? 40 : 80;
        // Quota counts PART qty + KIT-without-BOM as 1 part each.
        // KIT with BOM must NOT explode into quota — parts carry capacity via PART lines.
        const partsQty =
          row.product.kind === ProductKind.PART
            ? row.netNeed
            : row.missingBom
              ? row.netNeed
              : 0;

        launchCandidates.push({
          key: `${row.product.id}:PRODUCTION`,
          productId: row.product.id,
          partsQty,
          priority,
          deficit: row.netNeed,
          base: row,
          reason:
            row.product.kind === ProductKind.PART
              ? "Part net need"
              : row.missingBom
                ? "Net need (KIT without BOM counted as parts)"
                : "Net need within production lead horizon",
        });
      }
    }

    const quotaSlices = allocateMonthlyQuota(
      launchCandidates.map((c) => ({
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

    for (const c of launchCandidates) {
      const slice = sliceByKey.get(c.key);
      const leadDays = c.base.productionLeadDays + c.base.packLeadDays;
      const coverRisk = isCoverRisk(c.base.coverDays, leadDays);
      // Prefer PRODUCTION; for PART with cover/lead risk label as SEMI_REORDER (one line only).
      const lineType =
        c.base.product.kind === ProductKind.PART &&
        (coverRisk || c.base.status === "CRITICAL")
          ? PlanningRunLineType.SEMI_REORDER
          : PlanningRunLineType.PRODUCTION;

      // KIT with BOM: not quota-gated (partsQty=0) — suggest full kit netNeed.
      const quotaGated = c.partsQty > 0;
      const suggested = quotaGated
        ? (slice?.suggestedLaunchQty ?? 0)
        : c.deficit;
      const month0Qty = quotaGated ? (slice?.month0Qty ?? 0) : 0;
      const overflowed = quotaGated ? (slice?.overflowed ?? true) : false;
      const monthBucket = quotaGated ? (slice?.monthBucket ?? null) : 0;

      lines.push(
        draftLine(c.base, lineType, c.deficit, {
          reason:
            lineType === PlanningRunLineType.SEMI_REORDER
              ? "Part below safety / cover under lead time"
              : c.reason,
          details: {
            ...baseDetails(c.base),
            partsQty: c.partsQty,
            month0Qty,
            overflowed,
            quotaSuggested: suggested,
            quotaGated,
            kitDependentGross: c.base.kitDependentGross,
            ownGrossNeed: c.base.ownGrossNeed,
          },
          priority: c.priority,
          suggestedLaunchQty: suggested,
          monthBucket,
        }),
      );
    }

    // FULL consumers always see PACK/CAN_PACK/PRODUCTION from the FULL run.
    // CRITICAL mode keeps alert-oriented lines (CRITICAL + SEMI + high-priority PRODUCTION).
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

    const quotaLine = (l: MrpDraftLine) =>
      l.lineType === PlanningRunLineType.PRODUCTION ||
      l.lineType === PlanningRunLineType.SEMI_REORDER;
    const quotaUsedMonth0 = filtered
      .filter(quotaLine)
      .reduce((sum, l) => sum + (Number(l.details.month0Qty) || 0), 0);
    const quotaOverflowCount = filtered.filter(
      (l) => quotaLine(l) && l.details.overflowed === true,
    ).length;

    return {
      mode,
      coverMonths: horizon.coverMonths,
      monthlyPartsQuota: capacity.monthlyPartsQuota,
      velocityLookbackMonths: horizon.velocityLookbackMonths,
      snapshotId: posted?.id ?? null,
      freshness,
      salesFreshness,
      salesUploadId: salesFreshness.uploadId ?? null,
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

function baseDetails(
  row: {
    available: number;
    expectedWip: number;
    hardNeed: number;
    softNeed: number;
    forecastDemand: number;
    safetyStock: number;
    grossNeed: number;
    netNeed: number;
    avgDailySold: number;
    coverDays: number | null;
    status: string;
    productionLeadDays: number;
    packLeadDays: number;
    missingBom: boolean;
    velocitySource?: string;
  },
  extra: Record<string, unknown> = {},
) {
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
    coverDays: row.coverDays == null ? null : Math.round(row.coverDays * 10) / 10,
    status: row.status,
    productionLeadDays: row.productionLeadDays,
    packLeadDays: row.packLeadDays,
    missingBom: row.missingBom,
    velocitySource: row.velocitySource ?? "sales_history",
    breakdown: {
      hardNeed: row.hardNeed,
      softNeed: row.softNeed,
      forecastDemand: Math.round(row.forecastDemand * 100) / 100,
      safetyStock: row.safetyStock,
      available: row.available,
      expectedWip: row.expectedWip,
      grossNeed: Math.round(row.grossNeed * 100) / 100,
      netNeed: row.netNeed,
      avgDailySold: Math.round(row.avgDailySold * 1000) / 1000,
      velocitySource: row.velocitySource ?? "sales_history",
    },
    ...extra,
  };
}

function draftLine(
  row: { product: ProductRow; coverDays: number | null },
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
    coverDays: row.coverDays == null ? null : Math.round(row.coverDays * 10) / 10,
    reason: opts.reason,
    details: opts.details,
  };
}
