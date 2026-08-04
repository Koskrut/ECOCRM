import { Injectable } from "@nestjs/common";
import { OrderStage } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PlanningCalculationService } from "./planning-calculation.service";
import { MrpConfigService } from "./mrp-config.service";

export type ProductDemandForecast = {
  productId: string;
  avgMonthlySold: number;
  avgDailySold: number;
  hardNeed: number;
  softNeed: number;
  forecastDemand: number;
  monthlyOverride: number | null;
};

const EXCLUDED_STAGES: OrderStage[] = [OrderStage.CANCELED, OrderStage.REFUSED];

@Injectable()
export class DemandForecastService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculations: PlanningCalculationService,
    private readonly mrpConfig: MrpConfigService,
  ) {}

  /**
   * Velocity from OrderItem over lookback months (excluding CANCELED/REFUSED),
   * plus hard/soft backlog from demand rules.
   */
  async getDemandForecastMap(productIds?: string[]): Promise<Map<string, ProductDemandForecast>> {
    const horizon = await this.mrpConfig.getHorizon();
    const lookbackMonths = horizon.velocityLookbackMonths;
    const coverMonths = horizon.coverMonths;

    const since = new Date();
    since.setMonth(since.getMonth() - lookbackMonths);

    const params = await this.prisma.planningProductParams.findMany({
      where: productIds?.length
        ? { productId: { in: productIds }, isPlanned: true }
        : { isPlanned: true },
      select: { productId: true, monthlyForecastOverride: true },
    });
    const overrideByProduct = new Map(
      params.map((p) => [p.productId, p.monthlyForecastOverride ?? null]),
    );

    const velocityRows = await this.prisma.orderItem.findMany({
      where: {
        productId: productIds?.length ? { in: productIds } : { not: null },
        order: {
          orderStage: { notIn: EXCLUDED_STAGES },
          OR: [{ createdAt: { gte: since } }, { updatedAt: { gte: since } }],
        },
      },
      select: {
        productId: true,
        qty: true,
        qtyShipped: true,
        order: { select: { createdAt: true, orderStage: true } },
      },
    });

    const soldByProduct = new Map<string, number>();
    for (const row of velocityRows) {
      if (!row.productId) continue;
      // Prefer shipped qty when present; otherwise full line qty for open history.
      const sold = row.qtyShipped > 0 ? row.qtyShipped : row.qty;
      if (sold <= 0) continue;
      soldByProduct.set(row.productId, (soldByProduct.get(row.productId) ?? 0) + sold);
    }

    const backlog = await this.calculations.getDemandByProduct();

    const ids = new Set<string>([
      ...soldByProduct.keys(),
      ...backlog.keys(),
      ...overrideByProduct.keys(),
      ...(productIds ?? []),
    ]);

    const out = new Map<string, ProductDemandForecast>();
    for (const productId of ids) {
      if (productIds?.length && !productIds.includes(productId)) continue;
      const totalSold = soldByProduct.get(productId) ?? 0;
      const override = overrideByProduct.get(productId) ?? null;
      const avgMonthlySold =
        override != null && Number.isFinite(override)
          ? Math.max(0, override)
          : totalSold / Math.max(1, lookbackMonths);
      const avgDailySold = avgMonthlySold / 30;
      const hardNeed = backlog.get(productId)?.hard ?? 0;
      const softNeed = backlog.get(productId)?.soft ?? 0;
      // Velocity-only; soft pipeline is mixed in MrpCalculationService (avoids double-count).
      const forecastDemand = avgMonthlySold * coverMonths;

      out.set(productId, {
        productId,
        avgMonthlySold,
        avgDailySold,
        hardNeed,
        softNeed,
        forecastDemand,
        monthlyOverride: override,
      });
    }

    return out;
  }
}
