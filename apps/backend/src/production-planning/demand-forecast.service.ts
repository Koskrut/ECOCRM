import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { OrderStage, ProductKind, SalesHistoryUploadStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { computeProductVelocity, type VelocitySource } from "./demand-velocity.util";
import { MrpConfigService } from "./mrp-config.service";
import { PlanningCalculationService } from "./planning-calculation.service";
import { PlanningSettingsService } from "./planning-settings.service";
import { evaluateSalesFreshness } from "./sales-freshness.util";
import { SalesHistoryService } from "./sales-history.service";
import { effectiveSafetyStock, forecastQtyForDays, monthsAgoUtc } from "./planning-safety.util";

export type ForecastBreakdown = {
  hardNeed: number;
  softNeed: number;
  forecastDemand: number;
  safetyStock: number;
  avgMonthlySold: number;
  velocitySource: VelocitySource;
};

export type ProductDemandForecast = {
  productId: string;
  avgMonthlySold: number;
  avgDailySold: number;
  hardNeed: number;
  softNeed: number;
  forecastDemand: number;
  monthlyOverride: number | null;
  velocitySource: VelocitySource;
};

export type MrpForecastRow = {
  productId: string;
  sku: string;
  name: string;
  kind: string;
  monthlyHistory: Array<{ yearMonth: string; qty: number }>;
  avgMonthlySold: number;
  forecastDemand: number;
  hardNeed: number;
  softNeed: number;
  safetyStock: number;
  velocitySource: VelocitySource;
  breakdown: ForecastBreakdown;
};

const EXCLUDED_ORDER_STAGES: OrderStage[] = [OrderStage.CANCELED, OrderStage.REFUSED];

@Injectable()
export class DemandForecastService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => PlanningCalculationService))
    private readonly calculations: PlanningCalculationService,
    private readonly mrpConfig: MrpConfigService,
    private readonly planningSettings: PlanningSettingsService,
    private readonly salesHistory: SalesHistoryService,
  ) {}

  async countDistinctSalesMonths(lookbackMonths: number): Promise<number> {
    const since = monthsAgoUtc(lookbackMonths);
    const rows = await this.prisma.salesHistoryLine.findMany({
      where: {
        upload: { status: SalesHistoryUploadStatus.POSTED },
        soldAt: { gte: since },
        productId: { not: null },
      },
      select: { yearMonth: true, soldAt: true },
    });
    const months = new Set<string>();
    for (const row of rows) {
      const ym =
        row.yearMonth ??
        `${row.soldAt.getUTCFullYear()}-${String(row.soldAt.getUTCMonth() + 1).padStart(2, "0")}`;
      months.add(ym);
    }
    return months.size;
  }

  async evaluateSalesFreshnessWithCoverage() {
    const [settings, horizon, latestPosted] = await Promise.all([
      this.planningSettings.getSettings(),
      this.mrpConfig.getHorizon(),
      this.salesHistory.latestPosted(),
    ]);
    const requiredMonths = Math.min(
      settings.salesMinCoverageMonths,
      horizon.velocityLookbackMonths,
      18,
    );
    const distinctMonths = await this.countDistinctSalesMonths(horizon.velocityLookbackMonths);
    return evaluateSalesFreshness(latestPosted, settings.snapshotMaxAgeDays, new Date(), {
      distinctMonths,
      requiredMonths,
    });
  }

  /**
   * Velocity: override → CRM shipped qty → POSTED sales XLS fallback.
   */
  async getDemandForecastMap(productIds?: string[]): Promise<Map<string, ProductDemandForecast>> {
    const horizon = await this.mrpConfig.getHorizon();
    const lookbackMonths = horizon.velocityLookbackMonths;
    const coverMonths = horizon.coverMonths;

    const since = monthsAgoUtc(lookbackMonths);

    const params = await this.prisma.planningProductParams.findMany({
      where: productIds?.length
        ? { productId: { in: productIds }, isPlanned: true }
        : { isPlanned: true },
      select: { productId: true, monthlyForecastOverride: true, safetyStock: true },
    });
    const overrideByProduct = new Map(
      params.map((p) => [p.productId, p.monthlyForecastOverride ?? null]),
    );

    const salesRows = await this.prisma.salesHistoryLine.findMany({
      where: {
        upload: { status: SalesHistoryUploadStatus.POSTED },
        soldAt: { gte: since },
        productId: productIds?.length ? { in: productIds } : { not: null },
      },
      select: { productId: true, qty: true },
    });

    const soldByProduct = new Map<string, number>();
    for (const row of salesRows) {
      if (!row.productId) continue;
      soldByProduct.set(row.productId, (soldByProduct.get(row.productId) ?? 0) + row.qty);
    }

    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        productId: productIds?.length ? { in: productIds } : { not: null },
        qtyShipped: { gt: 0 },
        order: {
          createdAt: { gte: since },
          orderStage: { notIn: EXCLUDED_ORDER_STAGES },
        },
      },
      select: { productId: true, qtyShipped: true },
    });

    const orderQtyByProduct = new Map<string, number>();
    for (const row of orderItems) {
      if (!row.productId) continue;
      orderQtyByProduct.set(
        row.productId,
        (orderQtyByProduct.get(row.productId) ?? 0) + (row.qtyShipped ?? 0),
      );
    }

    const backlog = await this.calculations.getDemandByProduct();

    const ids = new Set<string>([
      ...soldByProduct.keys(),
      ...orderQtyByProduct.keys(),
      ...backlog.keys(),
      ...overrideByProduct.keys(),
      ...(productIds ?? []),
    ]);

    const out = new Map<string, ProductDemandForecast>();
    for (const productId of ids) {
      if (productIds?.length && !productIds.includes(productId)) continue;
      const override = overrideByProduct.get(productId) ?? null;
      const velocity = computeProductVelocity({
        totalSoldInLookback: soldByProduct.get(productId) ?? 0,
        totalOrderQtyInLookback: orderQtyByProduct.get(productId) ?? 0,
        lookbackMonths,
        coverMonths,
        override,
      });
      const hardNeed = backlog.get(productId)?.hard ?? 0;
      const softNeed = backlog.get(productId)?.soft ?? 0;

      out.set(productId, {
        productId,
        avgMonthlySold: velocity.avgMonthlySold,
        avgDailySold: velocity.avgMonthlySold / 30,
        hardNeed,
        softNeed,
        forecastDemand: velocity.forecastDemand,
        monthlyOverride: override,
        velocitySource: velocity.velocitySource,
      });
    }

    return out;
  }

  /** Forecast qty map from posted sales velocity (replaces legacy KitDemandForecast reads). */
  async getForecastQtyMap(horizonDays: number, productIds?: string[]): Promise<Map<string, number>> {
    const map = await this.getDemandForecastMap(productIds);
    const out = new Map<string, number>();
    for (const [productId, row] of map) {
      out.set(productId, forecastQtyForDays(row.avgMonthlySold, horizonDays));
    }
    return out;
  }

  async getMrpForecastView() {
    const [horizon, settings, latestPosted, salesFreshness] = await Promise.all([
      this.mrpConfig.getHorizon(),
      this.planningSettings.getSettings(),
      this.salesHistory.latestPosted(),
      this.evaluateSalesFreshnessWithCoverage(),
    ]);

    const since = monthsAgoUtc(Math.max(horizon.velocityLookbackMonths, horizon.coverMonths, 18));

    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        kind: { in: [ProductKind.KIT, ProductKind.PART] },
      },
      select: { id: true, sku: true, name: true, kind: true },
      orderBy: [{ kind: "asc" }, { sku: "asc" }],
    });

    const forecastMap = await this.getDemandForecastMap(products.map((p) => p.id));

    const historyRows =
      latestPosted != null
        ? await this.prisma.salesHistoryLine.findMany({
            where: {
              uploadId: latestPosted.id,
              soldAt: { gte: since },
              productId: { not: null },
            },
            select: { productId: true, yearMonth: true, soldAt: true, qty: true },
          })
        : [];

    const historyByProduct = new Map<string, Map<string, number>>();
    for (const row of historyRows) {
      if (!row.productId) continue;
      const ym =
        row.yearMonth ??
        `${row.soldAt.getUTCFullYear()}-${String(row.soldAt.getUTCMonth() + 1).padStart(2, "0")}`;
      const byMonth = historyByProduct.get(row.productId) ?? new Map<string, number>();
      byMonth.set(ym, (byMonth.get(ym) ?? 0) + row.qty);
      historyByProduct.set(row.productId, byMonth);
    }

    const params = await this.prisma.planningProductParams.findMany({
      select: { productId: true, safetyStock: true },
    });
    const safetyByProduct = new Map(params.map((p) => [p.productId, p.safetyStock]));

    const rows: MrpForecastRow[] = products.map((product) => {
      const forecast = forecastMap.get(product.id);
      const avgMonthlySold = forecast?.avgMonthlySold ?? 0;
      const velocitySource = forecast?.velocitySource ?? "sales_history";
      const hardNeed = forecast?.hardNeed ?? 0;
      const softNeed = forecast?.softNeed ?? 0;
      const forecastDemand =
        forecast?.forecastDemand ?? Math.ceil(avgMonthlySold * horizon.coverMonths);
      const safetyStock = effectiveSafetyStock(
        safetyByProduct.get(product.id),
        avgMonthlySold,
        horizon.safetyMonths,
      );
      const monthly = historyByProduct.get(product.id) ?? new Map<string, number>();
      return {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        kind: product.kind,
        monthlyHistory: [...monthly.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([yearMonth, qty]) => ({ yearMonth, qty })),
        avgMonthlySold,
        forecastDemand,
        hardNeed,
        softNeed,
        safetyStock,
        velocitySource,
        breakdown: {
          hardNeed,
          softNeed,
          forecastDemand,
          safetyStock,
          avgMonthlySold,
          velocitySource,
        },
      };
    });

    return {
      horizon,
      salesFreshness,
      salesUploadId: latestPosted?.id ?? null,
      rows,
    };
  }
}
