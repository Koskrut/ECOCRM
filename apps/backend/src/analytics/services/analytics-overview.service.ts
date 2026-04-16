import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService, type ExchangeRates } from "../../settings/settings.service";
import type { AnalyticsScope } from "../analytics-scope.service";
import {
  buildLeadPeriodWhere,
  buildOverdueTaskWhereForPeriod,
  buildPaymentPeriodWhere,
  buildPeriodOrderWhere,
} from "../utils/analytics-filter.builder";
import { previousPeriodOfSameLength, type ResolvedPeriod } from "../utils/analytics-date.util";
import { safeNum, toUsd } from "../utils/analytics-currency.util";

export type OverviewCharts = {
  bookedRevenueByDay: { date: string; usd: number; ordersCount: number }[];
  collectedPaymentsByDay: { date: string; usd: number; paymentCount: number }[];
  ordersByStage: { stage: string; count: number }[];
};

export type OverviewPayload = {
  kpi: {
    bookedRevenue: number;
    collectedPayments: number;
    ordersCount: number;
    avgCheck: number;
    debtTotal: number;
    overdueDebt: number;
    /** WON / leads created in period (%). Proxy only — not order conversion; UI label: WON share (proxy). */
    leadConversionProxy: number;
    leadsCreatedCount: number;
  };
  charts: OverviewCharts;
  attention: {
    crm: {
      overdueTasksCount: number;
      stuckOrdersCount: number;
      leadsWithoutTouchCount: number;
    };
    finance: { overdueOrdersCount: number; overdueDebtAmount: number };
  };
};

@Injectable()
export class AnalyticsOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * `compare` returns **only** `kpi` for the previous window (`previousPeriodOfSameLength`), same scope.
   * Charts and the `attention` block are omitted from `compare` (UI does not show prior-period deltas there).
   */
  async getOverview(
    period: ResolvedPeriod,
    scope: AnalyticsScope,
    opts?: { compare?: boolean },
  ): Promise<{ period: ResolvedPeriod; data: OverviewPayload; compare?: { kpi: OverviewPayload["kpi"] } }> {
    if (scope.emptyTeam) {
      const empty = this.emptyPayload();
      return { period, data: empty, compare: opts?.compare ? { kpi: empty.kpi } : undefined };
    }
    const data = await this.computePayload(period, scope);
    const result: {
      period: ResolvedPeriod;
      data: OverviewPayload;
      compare?: { kpi: OverviewPayload["kpi"] };
    } = {
      period,
      data,
    };
    if (opts?.compare) {
      const prev = await this.computePayload(previousPeriodOfSameLength(period.from, period.to), scope);
      result.compare = { kpi: prev.kpi };
    }
    return result;
  }

  private emptyPayload(): OverviewPayload {
    const emptyCharts: OverviewCharts = {
      bookedRevenueByDay: [],
      collectedPaymentsByDay: [],
      ordersByStage: [],
    };
    return {
      kpi: {
        bookedRevenue: 0,
        collectedPayments: 0,
        ordersCount: 0,
        avgCheck: 0,
        debtTotal: 0,
        overdueDebt: 0,
        leadConversionProxy: 0,
        leadsCreatedCount: 0,
      },
      charts: emptyCharts,
      attention: {
        crm: { overdueTasksCount: 0, stuckOrdersCount: 0, leadsWithoutTouchCount: 0 },
        finance: { overdueOrdersCount: 0, overdueDebtAmount: 0 },
      },
    };
  }

  private async computePayload(period: ResolvedPeriod, scope: AnalyticsScope): Promise<OverviewPayload> {
    const rates = await this.settings.getExchangeRates();
    const orderWhere = buildPeriodOrderWhere(period.from, period.to, scope.orderScope);
    const periodDebtWhere = buildPeriodOrderWhere(period.from, period.to, scope.orderScope);
    const overdueWhere: Prisma.OrderWhereInput = { ...periodDebtWhere, financialStatus: "OVERDUE" };

    const orderOwnerPrismaWhere: Prisma.OrderWhereInput = {};
    if (scope.orderScope.managerId) orderOwnerPrismaWhere.ownerId = scope.orderScope.managerId;
    else if (scope.orderScope.allowedOwnerIds !== undefined) {
      orderOwnerPrismaWhere.ownerId = { in: scope.orderScope.allowedOwnerIds };
    }

    const paymentWhere = buildPaymentPeriodWhere(period.from, period.to, orderOwnerPrismaWhere);
    const leadWhere = buildLeadPeriodWhere(period.from, period.to, {
      actor: scope.orderScope.actor,
      allowedOwnerIds: scope.orderScope.allowedOwnerIds,
      managerId: scope.orderScope.managerId,
    });

    // PERF: loads all matching orders/payments in-window for aggregates + day charts. If this becomes hot,
    // consider SQL GROUP BY day / materialized rollups (not done here).
    const [
      ordersForRevenue,
      ordersCount,
      paymentsRows,
      ordersByStageRows,
      debtOrders,
      overdueDebtOrders,
      leadsTotal,
      leadsWon,
      overdueTasksCount,
      stuckCount,
      leadsNoTouchCount,
      overdueOrdersCount,
      overdueDebtAmountOrders,
    ] = await Promise.all([
      this.prisma.order.findMany({
        where: orderWhere,
        select: { createdAt: true, totalAmount: true, returnAdjustmentAmount: true, currency: true },
      }),
      this.prisma.order.count({ where: orderWhere }),
      this.prisma.payment.findMany({
        where: paymentWhere,
        select: { paidAt: true, amount: true, currency: true, amountUsd: true },
      }),
      this.prisma.order.groupBy({
        by: ["orderStage"],
        where: orderWhere,
        _count: { id: true },
      }),
      this.prisma.order.findMany({ where: periodDebtWhere, select: { debtAmount: true, currency: true } }),
      this.prisma.order.findMany({ where: overdueWhere, select: { debtAmount: true, currency: true } }),
      this.prisma.lead.count({ where: leadWhere }),
      this.prisma.lead.count({ where: { ...leadWhere, status: "WON" } }),
      this.prisma.task.count({
        where: buildOverdueTaskWhereForPeriod(period.from, period.to, {
          managerId: scope.orderScope.managerId,
          allowedAssigneeIds: scope.allowedAssigneeIds,
        }),
      }),
      this.countStuckOrders(scope, period),
      this.countLeadsWithoutTouch(scope, period),
      this.prisma.order.count({ where: { ...overdueWhere, debtAmount: { gt: 0 } } }),
      this.prisma.order.findMany({
        where: { ...overdueWhere, debtAmount: { gt: 0 } },
        select: { debtAmount: true, currency: true },
      }),
    ]);

    let bookedRevenue = 0;
    const byOrderCurrency: Record<string, number> = {};
    for (const o of ordersForRevenue) {
      const cur = (o.currency || "USD").trim().toUpperCase();
      byOrderCurrency[cur] = (byOrderCurrency[cur] ?? 0) + 1;
      bookedRevenue += toUsd(
        Math.max(0, safeNum(o.totalAmount) - safeNum(o.returnAdjustmentAmount)),
        cur,
        rates,
      );
    }

    let collectedPayments = 0;
    const byPaymentCurrency: Record<string, number> = {};
    for (const p of paymentsRows) {
      const cur = (p.currency || "USD").trim().toUpperCase();
      byPaymentCurrency[cur] = (byPaymentCurrency[cur] ?? 0) + 1;
      collectedPayments += p.amountUsd != null ? safeNum(p.amountUsd) : toUsd(safeNum(p.amount), cur, rates);
    }

    let debtTotal = 0;
    for (const o of debtOrders) debtTotal += toUsd(safeNum(o.debtAmount), o.currency, rates);
    let overdueDebt = 0;
    for (const o of overdueDebtOrders) overdueDebt += toUsd(safeNum(o.debtAmount), o.currency, rates);
    let overdueDebtAmount = 0;
    for (const o of overdueDebtAmountOrders) overdueDebtAmount += toUsd(safeNum(o.debtAmount), o.currency, rates);

    const charts: OverviewCharts = {
      bookedRevenueByDay: this.buildBookedRevenueByDay(ordersForRevenue, rates),
      collectedPaymentsByDay: this.buildCollectedPaymentsByDay(paymentsRows, rates),
      ordersByStage: ordersByStageRows
        .map((r) => ({
          stage: r.orderStage ?? "UNKNOWN",
          count: r._count.id,
        }))
        .sort((a, b) => b.count - a.count),
    };

    return {
      kpi: {
        bookedRevenue,
        collectedPayments,
        ordersCount,
        avgCheck: ordersCount > 0 ? bookedRevenue / ordersCount : 0,
        debtTotal,
        overdueDebt,
        leadConversionProxy: leadsTotal > 0 ? Math.round((leadsWon / leadsTotal) * 10000) / 100 : 0,
        leadsCreatedCount: leadsTotal,
      },
      charts,
      attention: {
        crm: {
          overdueTasksCount,
          stuckOrdersCount: stuckCount,
          leadsWithoutTouchCount: leadsNoTouchCount,
        },
        finance: {
          overdueOrdersCount,
          overdueDebtAmount,
        },
      },
    };
  }

  private buildBookedRevenueByDay(
    orders: Array<{
      createdAt: Date;
      totalAmount: number;
      returnAdjustmentAmount: number;
      currency: string;
    }>,
    rates: ExchangeRates,
  ): OverviewCharts["bookedRevenueByDay"] {
    const byDay = new Map<string, { usd: number; ordersCount: number }>();
    for (const o of orders) {
      const date = o.createdAt.toISOString().slice(0, 10);
      const cur = (o.currency || "USD").trim().toUpperCase();
      const usd = toUsd(
        Math.max(0, safeNum(o.totalAmount) - safeNum(o.returnAdjustmentAmount)),
        cur,
        rates,
      );
      const prev = byDay.get(date) ?? { usd: 0, ordersCount: 0 };
      prev.usd += usd;
      prev.ordersCount += 1;
      byDay.set(date, prev);
    }
    return Array.from(byDay.entries())
      .map(([date, v]) => ({ date, usd: v.usd, ordersCount: v.ordersCount }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private buildCollectedPaymentsByDay(
    payments: Array<{
      paidAt: Date | null;
      amount: unknown;
      currency: string;
      amountUsd: unknown;
    }>,
    rates: ExchangeRates,
  ): OverviewCharts["collectedPaymentsByDay"] {
    const byDay = new Map<string, { usd: number; paymentCount: number }>();
    for (const p of payments) {
      if (!p.paidAt) continue;
      const date = p.paidAt.toISOString().slice(0, 10);
      const cur = (p.currency || "USD").trim().toUpperCase();
      const usd =
        p.amountUsd != null && p.amountUsd !== undefined
          ? safeNum(p.amountUsd)
          : toUsd(safeNum(p.amount), cur, rates);
      const prev = byDay.get(date) ?? { usd: 0, paymentCount: 0 };
      prev.usd += usd;
      prev.paymentCount += 1;
      byDay.set(date, prev);
    }
    return Array.from(byDay.entries())
      .map(([date, v]) => ({ date, usd: v.usd, paymentCount: v.paymentCount }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private async countStuckOrders(scope: AnalyticsScope, period: ResolvedPeriod): Promise<number> {
    const asOf = period.to;
    const cutoff = new Date(asOf);
    cutoff.setDate(cutoff.getDate() - 3);
    const where: Prisma.OrderWhereInput = {
      OR: [{ orderStage: null }, { orderStage: { notIn: ["CANCELED", "REFUSED", "COMPLETED"] } }],
      createdAt: { gte: period.from, lte: period.to },
    };
    if (scope.orderScope.managerId) where.ownerId = scope.orderScope.managerId;
    else if (scope.orderScope.allowedOwnerIds !== undefined) {
      where.ownerId = { in: scope.orderScope.allowedOwnerIds };
    }
    const orders = await this.prisma.order.findMany({
      where,
      take: 600,
      select: {
        id: true,
        orderStage: true,
        updatedAt: true,
        statusHistory: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true, toOrderStage: true },
        },
      },
    });
    return orders.filter((o) => {
      const last = o.statusHistory[0];
      const since = last?.createdAt ?? o.updatedAt;
      return since < cutoff;
    }).length;
  }

  private async countLeadsWithoutTouch(scope: AnalyticsScope, period: ResolvedPeriod): Promise<number> {
    const asOf = period.to;
    const cutoffNew = new Date(asOf);
    cutoffNew.setDate(cutoffNew.getDate() - 3);
    const cutoffIp = new Date(asOf);
    cutoffIp.setDate(cutoffIp.getDate() - 7);
    const newUpper = period.to < cutoffNew ? period.to : cutoffNew;
    const ipUpper = period.to < cutoffIp ? period.to : cutoffIp;

    const ownerFilter: Prisma.LeadWhereInput = {};
    if (scope.orderScope.managerId) ownerFilter.ownerId = scope.orderScope.managerId;
    else if (scope.orderScope.allowedOwnerIds && scope.orderScope.allowedOwnerIds.length > 0) {
      ownerFilter.OR = [
        { ownerId: { in: scope.orderScope.allowedOwnerIds } },
        { ownerId: null },
      ];
    }

    const [newLeads, ipLeads] = await Promise.all([
      this.prisma.lead.count({
        where: {
          ...ownerFilter,
          status: "NEW",
          createdAt: { gte: period.from, lte: newUpper },
          NOT: { activities: { some: { createdAt: { gte: cutoffNew } } } },
        },
      }),
      this.prisma.lead.count({
        where: {
          ...ownerFilter,
          status: "IN_PROGRESS",
          createdAt: { gte: period.from, lte: ipUpper },
          NOT: { activities: { some: { createdAt: { gte: cutoffIp } } } },
        },
      }),
    ]);
    return newLeads + ipLeads;
  }
}

