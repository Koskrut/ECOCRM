import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../../settings/settings.service";
import type { AnalyticsScope } from "../analytics-scope.service";
import {
  buildOverdueTaskWhereForPeriod,
  buildPaymentPeriodWhere,
  buildPeriodOrderWhere,
} from "../utils/analytics-filter.builder";
import { previousPeriodOfSameLength, type ResolvedPeriod } from "../utils/analytics-date.util";
import { safeNum, getBaseCurrency, paymentToBase, toBaseCurrency } from "../utils/analytics-currency.util";

export type SalesPayload = {
  kpi: {
    bookedRevenue: number;
    collectedPayments: number;
    ordersCount: number;
    avgCheck: number;
    /** Open tasks with dueAt in the selected period (assignee / manager scope). */
    overdueTasksCount: number;
  };
  byStage: { stage: string; count: number }[];
};

/** Prior-period KPIs (money/orders + period overdue tasks); no byStage. */
export type SalesComparePayload = {
  kpi: SalesPayload["kpi"];
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
  ): Promise<{ period: ResolvedPeriod; currency: string; data: SalesPayload; compare?: SalesComparePayload }> {
    const rates = await this.settings.getExchangeRates();
    const currency = getBaseCurrency(rates);
    if (scope.emptyTeam) {
      const empty: SalesPayload = {
        kpi: { bookedRevenue: 0, collectedPayments: 0, ordersCount: 0, avgCheck: 0, overdueTasksCount: 0 },
        byStage: [],
      };
      const compareKpi: SalesComparePayload["kpi"] = {
        bookedRevenue: 0,
        collectedPayments: 0,
        ordersCount: 0,
        avgCheck: 0,
        overdueTasksCount: 0,
      };
      return { period, currency, data: empty, compare: opts?.compare ? { kpi: compareKpi } : undefined };
    }
    const data = await this.compute(period, scope, rates, { includeOverdueForPeriod: true, includeByStage: true });
    const result: { period: ResolvedPeriod; currency: string; data: SalesPayload; compare?: SalesComparePayload } = {
      period,
      currency,
      data,
    };
    if (opts?.compare) {
      const prev = await this.compute(previousPeriodOfSameLength(period.from, period.to), scope, rates, {
        includeOverdueForPeriod: true,
        includeByStage: false,
      });
      result.compare = { kpi: { ...prev.kpi } };
    }
    return result;
  }

  private async compute(
    period: ResolvedPeriod,
    scope: AnalyticsScope,
    rates: Awaited<ReturnType<SettingsService["getExchangeRates"]>>,
    flags: { includeOverdueForPeriod: boolean; includeByStage: boolean },
  ): Promise<SalesPayload> {
    const orderWhere = buildPeriodOrderWhere(period.from, period.to, scope.orderScope);
    const orderOwnerPrismaWhere: Prisma.OrderWhereInput = {};
    if (scope.orderScope.managerId) orderOwnerPrismaWhere.ownerId = scope.orderScope.managerId;
    else if (scope.orderScope.allowedOwnerIds !== undefined) {
      orderOwnerPrismaWhere.ownerId = { in: scope.orderScope.allowedOwnerIds };
    }
    const paymentWhere = buildPaymentPeriodWhere(period.from, period.to, orderOwnerPrismaWhere);
    const overdueWhere = buildOverdueTaskWhereForPeriod(period.from, period.to, {
      managerId: scope.orderScope.managerId,
      allowedAssigneeIds: scope.allowedAssigneeIds,
    });

    // PERF: for compare-only path we skip byStage + overdue task query when disabled.
    const [ordersForRevenue, ordersCount, paymentsRows, byStageRows, overdueTasksCount] = await Promise.all([
      this.prisma.order.findMany({
        where: orderWhere,
        select: { totalAmount: true, returnAdjustmentAmount: true, currency: true },
      }),
      this.prisma.order.count({ where: orderWhere }),
      this.prisma.payment.findMany({
        where: paymentWhere,
        select: { amount: true, currency: true, amountUsd: true },
      }),
      flags.includeByStage
        ? this.prisma.order.groupBy({ by: ["orderStage"], where: orderWhere, _count: { id: true } })
        : Promise.resolve([]),
      flags.includeOverdueForPeriod
        ? this.prisma.task.count({ where: overdueWhere })
        : Promise.resolve(0),
    ]);

    let bookedRevenue = 0;
    for (const o of ordersForRevenue) {
      const cur = (o.currency || "USD").trim().toUpperCase();
      bookedRevenue += toBaseCurrency(
        Math.max(0, safeNum(o.totalAmount) - safeNum(o.returnAdjustmentAmount)),
        cur,
        rates,
      );
    }
    let collectedPayments = 0;
    for (const p of paymentsRows) {
      const cur = (p.currency || "USD").trim().toUpperCase();
      collectedPayments += paymentToBase(p.amountUsd, p.amount, cur, rates);
    }

    return {
      kpi: {
        bookedRevenue,
        collectedPayments,
        ordersCount,
        avgCheck: ordersCount > 0 ? bookedRevenue / ordersCount : 0,
        overdueTasksCount,
      },
      byStage: byStageRows.map((r) => ({ stage: r.orderStage ?? "NEW", count: r._count.id })),
    };
  }
}


