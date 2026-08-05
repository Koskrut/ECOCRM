import { BadRequestException, Injectable } from "@nestjs/common";
import { ProductKind, SalesHistoryUploadStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { DemandForecastService } from "./demand-forecast.service";
import { mergeMonthlySalesHistory } from "./forecast-history-merge.util";

const FORECAST_HORIZONS = [14, 30, 90] as const;
const METHOD = "avg_3_6_12m_seasonal_yoy";

export type ForecastRow = {
  productId: string;
  sku: string;
  name: string;
  horizonDays: number;
  qty: number;
  method: string;
  computedAt: Date;
};

@Injectable()
export class ForecastService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly demandForecast: DemandForecastService,
  ) {}

  async listForecasts(horizonDays?: number): Promise<ForecastRow[]> {
    const rows = await this.prisma.kitDemandForecast.findMany({
      where: horizonDays ? { horizonDays } : undefined,
      include: { product: { select: { id: true, sku: true, name: true } } },
      orderBy: [{ horizonDays: "asc" }, { qty: "desc" }],
    });
    return rows.map((r) => ({
      productId: r.productId,
      sku: r.product.sku,
      name: r.product.name,
      horizonDays: r.horizonDays,
      qty: r.qty,
      method: r.method,
      computedAt: r.computedAt,
    }));
  }

  async getForecastMap(horizonDays: number): Promise<Map<string, number>> {
    return this.demandForecast.getForecastQtyMap(horizonDays);
  }

  async importSalesHistory(_fileBuffer: Buffer) {
    throw new BadRequestException(
      "Use POST /planning/sales-history/upload then POST /planning/sales-history/:id/post",
    );
  }

  async recomputeForecasts() {
    const now = new Date();
    const kits = await this.prisma.product.findMany({
      where: { kind: ProductKind.KIT, isActive: true },
      select: { id: true, sku: true, name: true },
    });
    if (kits.length === 0) {
      return { computedProducts: 0, horizons: [...FORECAST_HORIZONS], method: METHOD };
    }

    const historyFrom = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 18, 1),
    );

    const [historyAgg, orderAgg] = await Promise.all([
      this.prisma.salesHistoryLine.groupBy({
        by: ["productId", "soldAt"],
        where: {
          productId: { in: kits.map((k) => k.id) },
          soldAt: { gte: historyFrom },
          upload: { status: SalesHistoryUploadStatus.POSTED },
        },
        _sum: { qty: true },
      }),
      this.prisma.orderItem.findMany({
        where: {
          productId: { in: kits.map((k) => k.id) },
          qtyShipped: { gt: 0 },
          order: { createdAt: { gte: historyFrom }, orderStage: { notIn: ["CANCELED", "REFUSED"] } },
        },
        select: {
          productId: true,
          qtyShipped: true,
          order: { select: { createdAt: true } },
        },
      }),
    ]);

    // Prefer imported sales history for months that already have Excel data; CRM fills gaps only.
    // Net ≤0 Excel months still block CRM (returns / cancellations).
    const monthly = mergeMonthlySalesHistory({
      excelRows: historyAgg
        .filter((row): row is typeof row & { productId: string } => Boolean(row.productId))
        .map((row) => ({
          productId: row.productId,
          soldAt: row.soldAt,
          qty: row._sum.qty ?? 0,
        })),
      crmRows: orderAgg
        .filter((row): row is typeof row & { productId: string } => Boolean(row.productId))
        .map((row) => ({
          productId: row.productId,
          soldAt: row.order.createdAt,
          qty: row.qtyShipped,
        })),
    });

    const computedAt = now;
    let computedProducts = 0;

    for (const kit of kits) {
      const months = monthly.get(kit.id) ?? new Map();
      const avg3 = averageLastMonths(months, now, 3);
      const avg6 = averageLastMonths(months, now, 6);
      const avg12 = averageLastMonths(months, now, 12);
      const baseMonthly = weightedAverage([avg3, avg6, avg12], [0.5, 0.3, 0.2]);
      const seasonalFactor = seasonalYoyFactor(months, now);
      const monthlyForecast = Math.max(0, baseMonthly * seasonalFactor);

      for (const horizonDays of FORECAST_HORIZONS) {
        const qty = Math.max(0, Math.round((monthlyForecast * horizonDays) / 30));
        await this.prisma.kitDemandForecast.upsert({
          where: { productId_horizonDays: { productId: kit.id, horizonDays } },
          create: {
            productId: kit.id,
            horizonDays,
            qty,
            method: METHOD,
            computedAt,
          },
          update: { qty, method: METHOD, computedAt },
        });
      }
      computedProducts += 1;
    }

    return {
      computedProducts,
      horizons: [...FORECAST_HORIZONS],
      method: METHOD,
      computedAt,
    };
  }
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function averageLastMonths(months: Map<string, number>, now: Date, count: number): number {
  let sum = 0;
  let n = 0;
  for (let i = 1; i <= count; i += 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const qty = months.get(monthKey(d));
    if (qty != null) {
      sum += qty;
      n += 1;
    }
  }
  return n > 0 ? sum / n : 0;
}

function weightedAverage(values: number[], weights: number[]): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i]! > 0) {
      num += values[i]! * weights[i]!;
      den += weights[i]!;
    }
  }
  return den > 0 ? num / den : 0;
}

/** Compare same month last year vs trailing avg of that month neighbors; fallback 1. */
function seasonalYoyFactor(months: Map<string, number>, now: Date): number {
  const thisMonthLastYear = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1));
  const yoy = months.get(monthKey(thisMonthLastYear));
  if (yoy == null) return 1;
  const around: number[] = [];
  for (let i = -1; i <= 1; i += 1) {
    if (i === 0) continue;
    const d = new Date(Date.UTC(thisMonthLastYear.getUTCFullYear(), thisMonthLastYear.getUTCMonth() + i, 1));
    const q = months.get(monthKey(d));
    if (q != null) around.push(q);
  }
  const baseline = around.length > 0 ? around.reduce((a, b) => a + b, 0) / around.length : yoy;
  if (baseline <= 0) return 1;
  return Math.min(2.5, Math.max(0.4, yoy / baseline));
}
