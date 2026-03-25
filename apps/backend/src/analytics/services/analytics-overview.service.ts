import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../../settings/settings.service";
import type { AnalyticsScope } from "../analytics-scope.service";
import {
  buildDebtOrderWhere,
  buildLeadPeriodWhere,
  buildOverdueTaskWhere,
  buildPaymentPeriodWhere,
  buildPeriodOrderWhere,
} from "../utils/analytics-filter.builder";
import { previousPeriodOfSameLength, type ResolvedPeriod } from "../utils/analytics-date.util";
import { safeNum, toUsd } from "../utils/analytics-currency.util";

export type OverviewKpi = {
  bookedRevenue: number;
  collectedPayments: number;
  ordersCount: number;
  avgCheck: number;
  debtTotal: number;
  overdueDebt: number;
  leadConversionProxy: number;
};

export type OverviewAttentionCounts = {
  crm: {
    overdueTasksCount: number;
    stuckOrdersCount: number;
    leadsWithoutTouchCount: number;
  };
  finance: {
    overdueOrdersCount: number;
    overdueDebtAmount: number;
  };
};

export type OverviewPayload = {
  kpi: OverviewKpi;
  attention: OverviewAttentionCounts;
};

@Injectable()
export class AnalyticsOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async getOverview(
    period: ResolvedPeriod,
    scope: AnalyticsScope,
    opts?: { compare?: boolean },
  ): Promise<{ period: ResolvedPeriod; data: OverviewPayload; compare?: OverviewPayload }> {
    if (scope.emptyTeam) {
      const empty = this.emptyPayload();
      const out: { period: ResolvedPeriod; data: OverviewPayload; compare?: OverviewPayload } = {
        period,
        data: empty,
      };
      if (opts?.compare) {
        out.compare = this.emptyPayload();
      }
      return out;
    }

    const data = await this.computePayload(period, scope);
    const result: { period: ResolvedPeriod; data: OverviewPayload; compare?: OverviewPayload } = {
      period,
      data,
    };
    if (opts?.compare) {
      const prev = previousPeriodOfSameLength(period.from, period.to);
      result.compare = await this.computePayload(prev, scope);
    }
    return result;
  }

  private emptyPayload(): OverviewPayload {
    return {
      kpi: {
        bookedRevenue: 0,
        collectedPayments: 0,
        ordersCount: 0,
        avgCheck: 0,
        debtTotal: 0,
        overdueDebt: 0,
        leadConversionProxy: 0,
      },
      attention: {
        crm: { overdueTasksCount: 0, stuckOrdersCount: 0, leadsWithoutTouchCount: 0 },
        finance: { overdueOrdersCount: 0, overdueDebtAmount: 0 },
      },
    };
  }

  private async computePayload(period: ResolvedPeriod, scope: AnalyticsScope): Promise<OverviewPayload> {
    const rates = await this.settings.getExchangeRates();
    const orderWhere = buildPeriodOrderWhere(period.from, period.to, scope.orderScope);
    const debtWhere = buildDebtOrderWhere(scope.orderScope);
    const overdueWhere: Prisma.OrderWhereInput = {
      ...debtWhere,
      financialStatus: "OVERDUE",
    };

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

    const leadWhere = buildLeadPeriodWhere(period.from, period.to, {
      actor: scope.orderScope.actor,
      allowedOwnerIds: scope.orderScope.allowedOwnerIds,
      managerId: scope.orderScope.managerId,
    });

    const [
      ordersForRevenue,
      ordersCount,
      paymentsRows,
      debtOrders,
      overdueDebtOrders,
      leadsTotal,
      leadsWon,
      overdueTasksCount,
      stuckCount,
      leadsNoTouchCount,
      overdueOrdersCount,
      overdueDebtAmountRow,
    ] = await Promise.all([
      this.prisma.order.findMany({
        where: orderWhere,
        select: { totalAmount: true, returnAdjustmentAmount: true, currency: true },
      }),
      this.prisma.order.count({ where: orderWhere }),
      this.prisma.payment.findMany({
        where: paymentWhere,
        select: { amount: true, currency: true, amountUsd: true },
      }),
      this.prisma.order.findMany({
        where: debtWhere,
        select: { debtAmount: true, currency: true },
      }),
      this.prisma.order.findMany({
        where: overdueWhere,
        select: { debtAmount: true, currency: true },
      }),
      this.prisma.lead.count({ where: leadWhere }),
      this.prisma.lead.count({ where: { ...leadWhere, status: "WON" } }),
      this.prisma.task.count({
        where: buildOverdueTaskWhere({ allowedAssigneeIds: scope.allowedAssigneeIds }),
      }),
      this.countStuckOrders(scope),
      this.countLeadsWithoutTouch(scope),
      this.prisma.order.count({
        where: { ...overdueWhere, debtAmount: { gt: 0 } },
      }),
      this.prisma.order.aggregate({
        where: { ...overdueWhere, debtAmount: { gt: 0 } },
        _sum: { debtAmount: true },
      }),
    ]);

    if (scope.orderScope.managerId) {
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "18e84e" },
        body: JSON.stringify({
          sessionId: "18e84e",
          runId: "run-manager-scope-1",
          hypothesisId: "H23",
          location: "analytics-overview.service.ts:managerScopedCounts",
          message: "Overview counts for manager scoped request",
          data: {
            managerId: scope.orderScope.managerId,
            ordersCount,
            paymentsCount: paymentsRows.length,
            debtOrdersCount: debtOrders.length,
            overdueDebtOrdersCount: overdueDebtOrders.length,
            leadsTotal,
            leadsWon,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    }

    let bookedRevenue = 0;
    const byOrderCurrency: Record<string, number> = {};
    for (const o of ordersForRevenue) {
      const cur = (o.currency || "USD").trim().toUpperCase();
      byOrderCurrency[cur] = (byOrderCurrency[cur] ?? 0) + 1;
      const t = safeNum(o.totalAmount);
      const adj = safeNum(o.returnAdjustmentAmount);
      const line = Math.max(0, t - adj);
      bookedRevenue += toUsd(line, cur, rates);
    }
    let collectedPayments = 0;
    const byPaymentCurrency: Record<string, number> = {};
    for (const p of paymentsRows) {
      const cur = (p.currency || "USD").trim().toUpperCase();
      byPaymentCurrency[cur] = (byPaymentCurrency[cur] ?? 0) + 1;
      if (p.amountUsd != null) {
        collectedPayments += safeNum(p.amountUsd);
      } else {
        collectedPayments += toUsd(safeNum(p.amount), cur, rates);
      }
    }

    let debtTotal = 0;
    for (const o of debtOrders) {
      debtTotal += toUsd(safeNum(o.debtAmount), o.currency, rates);
    }
    let overdueDebt = 0;
    for (const o of overdueDebtOrders) {
      overdueDebt += toUsd(safeNum(o.debtAmount), o.currency, rates);
    }
    const avgCheck = ordersCount > 0 ? bookedRevenue / ordersCount : 0;
    const leadConversionProxy =
      leadsTotal > 0 ? Math.round((leadsWon / leadsTotal) * 10000) / 100 : 0;

    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "18e84e" },
      body: JSON.stringify({
        sessionId: "18e84e",
        runId: "post-fix",
        hypothesisId: "H10",
        location: "analytics-overview.service.ts:computePayload",
        message: "Overview money conversion to USD",
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
        debtTotal,
        overdueDebt,
        leadConversionProxy,
      },
      attention: {
        crm: {
          overdueTasksCount,
          stuckOrdersCount: stuckCount,
          leadsWithoutTouchCount: leadsNoTouchCount,
        },
        finance: {
          overdueOrdersCount,
          overdueDebtAmount: Number(overdueDebtAmountRow._sum.debtAmount ?? 0),
        },
      },
    };
  }

  private async countStuckOrders(scope: AnalyticsScope): Promise<number> {
    const rows = await this.fetchStuckOrderIds(scope, 500);
    return rows.length;
  }

  private async fetchStuckOrderIds(scope: AnalyticsScope, limit: number): Promise<string[]> {
    const cutoff = new Date(Date.now() - 3 * 86400000);
    const baseWhere: Prisma.OrderWhereInput = {
      OR: [{ orderStage: null }, { orderStage: { notIn: ["CANCELED", "REFUSED", "COMPLETED"] } }],
    };
    if (scope.orderScope.managerId) {
      baseWhere.ownerId = scope.orderScope.managerId;
    } else if (scope.orderScope.allowedOwnerIds && scope.orderScope.allowedOwnerIds.length > 0) {
      baseWhere.ownerId = { in: scope.orderScope.allowedOwnerIds };
    }

    const orders = await this.prisma.order.findMany({
      where: baseWhere,
      take: Math.min(limit * 3, 600),
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

    const ids: string[] = [];
    for (const o of orders) {
      const last = o.statusHistory[0];
      const stageMatch =
        !last ||
        last.toOrderStage === o.orderStage ||
        (last.toOrderStage == null && o.orderStage == null);
      const since = last?.createdAt ?? o.updatedAt;
      if (stageMatch && since < cutoff) {
        ids.push(o.id);
        if (ids.length >= limit) break;
      }
    }
    return ids;
  }

  private async countLeadsWithoutTouch(scope: AnalyticsScope): Promise<number> {
    const rows = await this.fetchLeadsWithoutTouch(scope, 500);
    return rows.length;
  }

  private async fetchLeadsWithoutTouch(scope: AnalyticsScope, limit: number): Promise<string[]> {
    const now = new Date();
    const cutoffNew = new Date(now);
    cutoffNew.setDate(cutoffNew.getDate() - 3);
    const cutoffIp = new Date(now);
    cutoffIp.setDate(cutoffIp.getDate() - 7);

    const ownerFilter: Prisma.LeadWhereInput = {};
    if (scope.orderScope.managerId) {
      ownerFilter.ownerId = scope.orderScope.managerId;
    } else if (scope.orderScope.allowedOwnerIds && scope.orderScope.allowedOwnerIds.length > 0) {
      ownerFilter.OR = [
        { ownerId: { in: scope.orderScope.allowedOwnerIds } },
        { ownerId: null },
      ];
    }

    const activityWindowNew = new Date(now);
    activityWindowNew.setDate(activityWindowNew.getDate() - 3);
    const activityWindowIp = new Date(now);
    activityWindowIp.setDate(activityWindowIp.getDate() - 7);

    const newLeads = await this.prisma.lead.findMany({
      where: {
        ...ownerFilter,
        status: "NEW",
        createdAt: { lte: cutoffNew },
        NOT: {
          activities: {
            some: { createdAt: { gte: activityWindowNew } },
          },
        },
      },
      select: { id: true },
      take: limit,
    });

    const ipLeads = await this.prisma.lead.findMany({
      where: {
        ...ownerFilter,
        status: "IN_PROGRESS",
        createdAt: { lte: cutoffIp },
        NOT: {
          activities: {
            some: { createdAt: { gte: activityWindowIp } },
          },
        },
      },
      select: { id: true },
      take: limit,
    });

    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of [...newLeads, ...ipLeads]) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        out.push(r.id);
        if (out.length >= limit) break;
      }
    }
    return out;
  }
}
