import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../../settings/settings.service";
import type { AnalyticsScope } from "../analytics-scope.service";
import { buildDebtOrderWhere, buildPaymentPeriodWhere } from "../utils/analytics-filter.builder";
import { previousPeriodOfSameLength, type ResolvedPeriod } from "../utils/analytics-date.util";
import { safeNum, toUsd } from "../utils/analytics-currency.util";

export type FinanceKpi = {
  /** COMPLETED payments in period → USD (same semantics as Overview/Sales collected). */
  collectedPayments: number;
  /** Count of COMPLETED payments in period. */
  paymentsCount: number;
  /** collectedPayments / paymentsCount (USD). */
  avgPaymentUsd: number;
  /** Current total debt in scope — operational snapshot, not period cohort. */
  debtTotal: number;
  /** Current overdue debt (OVERDUE financial status) — snapshot. */
  overdueDebt: number;
  /** Orders with OVERDUE + debt &gt; 0 — snapshot. */
  overdueOrdersCount: number;
  /** Distinct clients with at least one overdue order (debt &gt; 0) — snapshot. */
  customersWithOverdueCount: number;
  /** Payments with status PENDING linked to scoped orders — snapshot. */
  pendingPaymentsCount: number;
};

export type FinanceCharts = {
  collectedPaymentsByDay: { date: string; usd: number; paymentCount: number }[];
  /** Debt by days past paymentDueDate — snapshot. */
  debtAgingBuckets: { label: string; amount: number; ordersCount: number }[];
  /** COMPLETED payments in period by sourceType (BANK / CASH). */
  paymentsBySourceType: { sourceType: string; count: number; usd: number }[];
};

export type FinanceTopDebtorRow = {
  clientId: string;
  clientName: string | null;
  debtAmount: number;
  overdueAmount: number;
  orderCount: number;
};

export type FinanceOverdueOrderRow = {
  id: string;
  orderNumber: string;
  clientName: string | null;
  debtAmount: number;
  paymentDueDate: string | null;
};

export type FinancePayload = {
  kpi: FinanceKpi;
  charts: FinanceCharts;
  tables: {
    topDebtors: FinanceTopDebtorRow[];
    overdueOrders: FinanceOverdueOrderRow[];
  };
};

export type FinanceComparePayload = {
  kpi: Pick<FinanceKpi, "collectedPayments" | "paymentsCount" | "avgPaymentUsd">;
};

@Injectable()
export class AnalyticsFinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async getFinance(
    period: ResolvedPeriod,
    scope: AnalyticsScope,
    opts?: { compare?: boolean },
  ): Promise<{ period: ResolvedPeriod; data: FinancePayload; compare?: FinanceComparePayload }> {
    if (scope.emptyTeam) {
      const empty = this.emptyPayload();
      return {
        period,
        data: empty,
        compare: opts?.compare
          ? {
              kpi: { collectedPayments: 0, paymentsCount: 0, avgPaymentUsd: 0 },
            }
          : undefined,
      };
    }
    const data = await this.compute(period, scope);
    const result: { period: ResolvedPeriod; data: FinancePayload; compare?: FinanceComparePayload } = {
      period,
      data,
    };
    if (opts?.compare) {
      const prev = await this.compute(previousPeriodOfSameLength(period.from, period.to), scope);
      result.compare = {
        kpi: {
          collectedPayments: prev.kpi.collectedPayments,
          paymentsCount: prev.kpi.paymentsCount,
          avgPaymentUsd: prev.kpi.avgPaymentUsd,
        },
      };
    }
    return result;
  }

  private emptyPayload(): FinancePayload {
    const z: FinanceKpi = {
      collectedPayments: 0,
      paymentsCount: 0,
      avgPaymentUsd: 0,
      debtTotal: 0,
      overdueDebt: 0,
      overdueOrdersCount: 0,
      customersWithOverdueCount: 0,
      pendingPaymentsCount: 0,
    };
    return {
      kpi: z,
      charts: {
        collectedPaymentsByDay: [],
        debtAgingBuckets: [],
        paymentsBySourceType: [],
      },
      tables: { topDebtors: [], overdueOrders: [] },
    };
  }

  private async compute(period: ResolvedPeriod, scope: AnalyticsScope): Promise<FinancePayload> {
    const rates = await this.settings.getExchangeRates();
    const debtWhere = buildDebtOrderWhere(scope.orderScope);
    const overdueWhere: Prisma.OrderWhereInput = { ...debtWhere, financialStatus: "OVERDUE" };
    const orderOwnerFilter: Prisma.OrderWhereInput = {};
    if (scope.orderScope.managerId) orderOwnerFilter.ownerId = scope.orderScope.managerId;
    else if (scope.orderScope.allowedOwnerIds !== undefined) {
      orderOwnerFilter.ownerId = { in: scope.orderScope.allowedOwnerIds };
    }
    const paymentWhere = buildPaymentPeriodWhere(period.from, period.to, orderOwnerFilter);

    // PERF: period payments loaded for aggregates + day/source breakdown — same pattern as overview collected series.
    const [
      paymentsRows,
      debtOrdersAll,
      overdueOrdersAll,
      debtOrdersWithDue,
      overdueOrdersRows,
      overdueOrdersCount,
      distinctOverdueClients,
      pendingPaymentsCount,
    ] = await Promise.all([
      this.prisma.payment.findMany({
        where: paymentWhere,
        select: { paidAt: true, amount: true, currency: true, amountUsd: true, sourceType: true },
      }),
      this.prisma.order.findMany({ where: debtWhere, select: { debtAmount: true, currency: true } }),
      this.prisma.order.findMany({ where: overdueWhere, select: { debtAmount: true, currency: true } }),
      this.prisma.order.findMany({
        where: { ...debtWhere, debtAmount: { gt: 0 }, paymentDueDate: { not: null } },
        select: {
          id: true,
          debtAmount: true,
          currency: true,
          paymentDueDate: true,
          financialStatus: true,
          clientId: true,
          client: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.order.findMany({
        where: { ...overdueWhere, debtAmount: { gt: 0 } },
        take: 50,
        orderBy: { paymentDueDate: "asc" },
        select: {
          id: true,
          orderNumber: true,
          debtAmount: true,
          currency: true,
          paymentDueDate: true,
          client: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.order.count({ where: { ...overdueWhere, debtAmount: { gt: 0 } } }),
      this.prisma.order.findMany({
        where: { ...overdueWhere, debtAmount: { gt: 0 }, clientId: { not: null } },
        distinct: ["clientId"],
        select: { clientId: true },
      }),
      this.prisma.payment.count({
        where: { status: "PENDING", order: orderOwnerFilter },
      }),
    ]);

    let collectedPayments = 0;
    const byDay = new Map<string, { usd: number; paymentCount: number }>();
    const bySource = new Map<string, { usd: number; count: number }>();

    for (const p of paymentsRows) {
      const cur = (p.currency || "USD").trim().toUpperCase();
      const usd = p.amountUsd != null ? safeNum(p.amountUsd) : toUsd(safeNum(p.amount), cur, rates);
      collectedPayments += usd;
      const date = p.paidAt.toISOString().slice(0, 10);
      const prevD = byDay.get(date) ?? { usd: 0, paymentCount: 0 };
      prevD.usd += usd;
      prevD.paymentCount += 1;
      byDay.set(date, prevD);
      const st = p.sourceType;
      const prevS = bySource.get(st) ?? { usd: 0, count: 0 };
      prevS.usd += usd;
      prevS.count += 1;
      bySource.set(st, prevS);
    }

    const paymentsCount = paymentsRows.length;
    const collectedPaymentsByDay = Array.from(byDay.entries())
      .map(([date, v]) => ({ date, usd: v.usd, paymentCount: v.paymentCount }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const paymentsBySourceType = Array.from(bySource.entries())
      .map(([sourceType, v]) => ({ sourceType, count: v.count, usd: v.usd }))
      .sort((a, b) => b.usd - a.usd);

    let debtTotal = 0;
    for (const o of debtOrdersAll) debtTotal += toUsd(safeNum(o.debtAmount), o.currency, rates);
    let overdueDebt = 0;
    for (const o of overdueOrdersAll) overdueDebt += toUsd(safeNum(o.debtAmount), o.currency, rates);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const buckets = [
      { label: "0-7", amount: 0, ordersCount: 0 },
      { label: "8-14", amount: 0, ordersCount: 0 },
      { label: "15-30", amount: 0, ordersCount: 0 },
      { label: "31-60", amount: 0, ordersCount: 0 },
      { label: "60+", amount: 0, ordersCount: 0 },
    ];
    const byClient = new Map<string, { name: string | null; debt: number; overdue: number; orders: number }>();

    for (const o of debtOrdersWithDue) {
      const due = new Date(o.paymentDueDate!);
      due.setHours(0, 0, 0, 0);
      const days = Math.floor((today.getTime() - due.getTime()) / 86400000);
      const debt = toUsd(safeNum(o.debtAmount), o.currency, rates);
      if (days >= 0) {
        let idx = 4;
        if (days <= 7) idx = 0;
        else if (days <= 14) idx = 1;
        else if (days <= 30) idx = 2;
        else if (days <= 60) idx = 3;
        buckets[idx].amount += debt;
        buckets[idx].ordersCount += 1;
      }
      if (o.clientId) {
        const cur = byClient.get(o.clientId) ?? {
          name: o.client ? [o.client.firstName, o.client.lastName].filter(Boolean).join(" ") : null,
          debt: 0,
          overdue: 0,
          orders: 0,
        };
        cur.debt += debt;
        cur.orders += 1;
        if (o.financialStatus === "OVERDUE") cur.overdue += debt;
        byClient.set(o.clientId, cur);
      }
    }

    const topDebtors: FinanceTopDebtorRow[] = [...byClient.entries()]
      .map(([clientId, v]) => ({
        clientId,
        clientName: v.name,
        debtAmount: v.debt,
        overdueAmount: v.overdue,
        orderCount: v.orders,
      }))
      .sort((a, b) => b.debtAmount - a.debtAmount)
      .slice(0, 20);

    const overdueOrders: FinanceOverdueOrderRow[] = overdueOrdersRows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      clientName: o.client ? [o.client.firstName, o.client.lastName].filter(Boolean).join(" ") : null,
      debtAmount: toUsd(safeNum(o.debtAmount), o.currency, rates),
      paymentDueDate: o.paymentDueDate?.toISOString() ?? null,
    }));

    const customersWithOverdueCount = distinctOverdueClients.length;

    const kpi: FinanceKpi = {
      collectedPayments,
      paymentsCount,
      avgPaymentUsd: paymentsCount > 0 ? collectedPayments / paymentsCount : 0,
      debtTotal,
      overdueDebt,
      overdueOrdersCount,
      customersWithOverdueCount,
      pendingPaymentsCount,
    };

    return {
      kpi,
      charts: {
        collectedPaymentsByDay,
        debtAgingBuckets: buckets,
        paymentsBySourceType,
      },
      tables: { topDebtors, overdueOrders },
    };
  }
}
