import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../../settings/settings.service";
import type { AnalyticsScope } from "../analytics-scope.service";
import { buildPaymentPeriodWhere, buildPeriodOrderWhere } from "../utils/analytics-filter.builder";
import { previousPeriodOfSameLength, type ResolvedPeriod } from "../utils/analytics-date.util";
import { safeNum, toUsd } from "../utils/analytics-currency.util";

export type SalesPayload = {
  kpi: {
    bookedRevenue: number;
    collectedPayments: number;
    ordersCount: number;
    avgCheck: number;
    /** Operational snapshot: overdue tasks for current assignee scope. */
    overdueTasksCount: number;
  };
  byStage: { stage: string; count: number }[];
};

/** Prior-period KPIs only (no operational snapshot, no byStage). */
export type SalesComparePayload = {
  kpi: Pick<SalesPayload["kpi"], "bookedRevenue" | "collectedPayments" | "ordersCount" | "avgCheck">;
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
  ): Promise<{ period: ResolvedPeriod; data: SalesPayload; compare?: SalesComparePayload }> {
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
      };
      return { period, data: empty, compare: opts?.compare ? { kpi: compareKpi } : undefined };
    }
    const data = await this.compute(period, scope, { includeOverdueSnapshot: true, includeByStage: true });
    const result: { period: ResolvedPeriod; data: SalesPayload; compare?: SalesComparePayload } = {
      period,
      data,
    };
    if (opts?.compare) {
      const prev = await this.compute(previousPeriodOfSameLength(period.from, period.to), scope, {
        includeOverdueSnapshot: false,
        includeByStage: false,
      });
      result.compare = { kpi: { ...prev.kpi } };
    }
    return result;
  }

  private async compute(
    period: ResolvedPeriod,
    scope: AnalyticsScope,
    flags: { includeOverdueSnapshot: boolean; includeByStage: boolean },
  ): Promise<SalesPayload> {
    const rates = await this.settings.getExchangeRates();
    const orderWhere = buildPeriodOrderWhere(period.from, period.to, scope.orderScope);
    const orderOwnerPrismaWhere: Prisma.OrderWhereInput = {};
    if (scope.orderScope.managerId) orderOwnerPrismaWhere.ownerId = scope.orderScope.managerId;
    else if (scope.orderScope.allowedOwnerIds !== undefined) {
      orderOwnerPrismaWhere.ownerId = { in: scope.orderScope.allowedOwnerIds };
    }
    const paymentWhere = buildPaymentPeriodWhere(period.from, period.to, orderOwnerPrismaWhere);
    const now = new Date();
    const overdueWhere: Prisma.TaskWhereInput = {
      dueAt: { not: null, lt: now },
      status: { in: ["OPEN", "IN_PROGRESS"] },
    };
    if (scope.orderScope.managerId) {
      overdueWhere.assigneeId = scope.orderScope.managerId;
    } else if (scope.allowedAssigneeIds !== undefined) {
      overdueWhere.assigneeId = { in: scope.allowedAssigneeIds };
    }

    // PERF: for compare-only path we skip byStage + overdue snapshot queries (not meaningful for prior window).
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
      flags.includeOverdueSnapshot
        ? this.prisma.task.count({ where: overdueWhere })
        : Promise.resolve(0),
    ]);

    let bookedRevenue = 0;
    for (const o of ordersForRevenue) {
      const cur = (o.currency || "USD").trim().toUpperCase();
      bookedRevenue += toUsd(
        Math.max(0, safeNum(o.totalAmount) - safeNum(o.returnAdjustmentAmount)),
        cur,
        rates,
      );
    }
    let collectedPayments = 0;
    for (const p of paymentsRows) {
      const cur = (p.currency || "USD").trim().toUpperCase();
      collectedPayments += p.amountUsd != null ? safeNum(p.amountUsd) : toUsd(safeNum(p.amount), cur, rates);
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


