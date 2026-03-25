import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../../settings/settings.service";
import type { AnalyticsScope } from "../analytics-scope.service";
import { buildPaymentPeriodWhere, buildPeriodOrderWhere } from "../utils/analytics-filter.builder";
import { previousPeriodOfSameLength, type ResolvedPeriod } from "../utils/analytics-date.util";
import { safeNum, toUsd } from "../utils/analytics-currency.util";

export type SalesKpi = {
  bookedRevenue: number;
  collectedPayments: number;
  ordersCount: number;
  avgCheck: number;
};

export type SalesPayload = {
  kpi: SalesKpi;
  byStage: { stage: string; count: number }[];
};

@Injectable()
export class AnalyticsSalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async getSales(
    period: ResolvedPeriod,
    scope: AnalyticsScope,
    opts?: { compare?: boolean },
  ): Promise<{ period: ResolvedPeriod; data: SalesPayload; compare?: SalesPayload }> {
    if (scope.emptyTeam) {
      const empty: SalesPayload = {
        kpi: { bookedRevenue: 0, collectedPayments: 0, ordersCount: 0, avgCheck: 0 },
        byStage: [],
      };
      const out: { period: ResolvedPeriod; data: SalesPayload; compare?: SalesPayload } = {
        period,
        data: empty,
      };
      if (opts?.compare) out.compare = empty;
      return out;
    }

    const data = await this.compute(period, scope);
    const result: { period: ResolvedPeriod; data: SalesPayload; compare?: SalesPayload } = {
      period,
      data,
    };
    if (opts?.compare) {
      result.compare = await this.compute(previousPeriodOfSameLength(period.from, period.to), scope);
    }
    return result;
  }

  private async compute(period: ResolvedPeriod, scope: AnalyticsScope): Promise<SalesPayload> {
    const rates = await this.settings.getExchangeRates();
    const orderWhere = buildPeriodOrderWhere(period.from, period.to, scope.orderScope);
    const orderOwnerPrismaWhere: Prisma.OrderWhereInput = {};
    if (scope.orderScope.managerId) {
      orderOwnerPrismaWhere.ownerId = scope.orderScope.managerId;
    } else if (
      scope.orderScope.allowedOwnerIds !== undefined &&
      scope.orderScope.allowedOwnerIds.length > 0
    ) {
      orderOwnerPrismaWhere.ownerId = { in: scope.orderScope.allowedOwnerIds };
    }
    const paymentWhere = buildPaymentPeriodWhere(period.from, period.to, orderOwnerPrismaWhere);

    const [ordersForRevenue, ordersCount, paymentsAgg, byStageRows] = await Promise.all([
      this.prisma.order.findMany({
        where: orderWhere,
        select: { totalAmount: true, returnAdjustmentAmount: true, currency: true },
      }),
      this.prisma.order.count({ where: orderWhere }),
      this.prisma.payment.findMany({
        where: paymentWhere,
        select: { amount: true, currency: true, amountUsd: true },
      }),
      this.prisma.order.groupBy({
        by: ["orderStage"],
        where: orderWhere,
        _count: { id: true },
      }),
    ]);

    let bookedRevenue = 0;
    const byOrderCurrency: Record<string, number> = {};
    for (const o of ordersForRevenue) {
      const cur = (o.currency || "USD").trim().toUpperCase();
      byOrderCurrency[cur] = (byOrderCurrency[cur] ?? 0) + 1;
      const t = safeNum(o.totalAmount);
      const adj = safeNum(o.returnAdjustmentAmount);
      bookedRevenue += toUsd(Math.max(0, t - adj), cur, rates);
    }
    let collectedPayments = 0;
    const byPaymentCurrency: Record<string, number> = {};
    for (const p of paymentsAgg) {
      const cur = (p.currency || "USD").trim().toUpperCase();
      byPaymentCurrency[cur] = (byPaymentCurrency[cur] ?? 0) + 1;
      if (p.amountUsd != null) collectedPayments += safeNum(p.amountUsd);
      else collectedPayments += toUsd(safeNum(p.amount), cur, rates);
    }
    const avgCheck = ordersCount > 0 ? bookedRevenue / ordersCount : 0;

    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "18e84e" },
      body: JSON.stringify({
        sessionId: "18e84e",
        runId: "post-fix",
        hypothesisId: "H11",
        location: "analytics-sales.service.ts:compute",
        message: "Sales money conversion to USD",
        data: {
          rates: { UAH_TO_USD: rates.UAH_TO_USD, EUR_TO_USD: rates.EUR_TO_USD },
          byOrderCurrency,
          byPaymentCurrency,
          bookedRevenueUsd: Math.round(bookedRevenue * 100) / 100,
          collectedPaymentsUsd: Math.round(collectedPayments * 100) / 100,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    return {
      kpi: {
        bookedRevenue,
        collectedPayments,
        ordersCount,
        avgCheck,
      },
      byStage: byStageRows.map((r) => ({
        stage: r.orderStage ?? "NEW",
        count: r._count.id,
      })),
    };
  }
}
