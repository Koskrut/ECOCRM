import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../../settings/settings.service";
import type { AnalyticsScope } from "../analytics-scope.service";
import { buildDebtOrderWhere, buildPaymentPeriodWhere } from "../utils/analytics-filter.builder";
import type { ResolvedPeriod } from "../utils/analytics-date.util";
import { safeNum, toUsd } from "../utils/analytics-currency.util";

export type AgingBucket = { label: string; amount: number; ordersCount: number };

export type TopDebtor = {
  clientId: string;
  clientName: string | null;
  debtAmount: number;
  overdueAmount: number;
  orderCount: number;
};

export type FinancePayload = {
  collectedPayments: number;
  debtTotal: number;
  overdueDebt: number;
  agingBuckets: AgingBucket[];
  topDebtors: TopDebtor[];
  overdueOrders: {
    id: string;
    orderNumber: string;
    clientName: string | null;
    debtAmount: number;
    paymentDueDate: string | null;
  }[];
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
  ): Promise<FinancePayload> {
    const rates = await this.settings.getExchangeRates();
    if (scope.emptyTeam) {
      return {
        collectedPayments: 0,
        debtTotal: 0,
        overdueDebt: 0,
        agingBuckets: [],
        topDebtors: [],
        overdueOrders: [],
      };
    }

    const debtWhere = buildDebtOrderWhere(scope.orderScope);
    const overdueWhere: Prisma.OrderWhereInput = {
      ...debtWhere,
      financialStatus: "OVERDUE",
    };

    const orderOwnerFilter: Prisma.OrderWhereInput = {};
    if (scope.orderScope.managerId) {
      orderOwnerFilter.ownerId = scope.orderScope.managerId;
    } else if (
      scope.orderScope.allowedOwnerIds !== undefined &&
      scope.orderScope.allowedOwnerIds.length > 0
    ) {
      orderOwnerFilter.ownerId = { in: scope.orderScope.allowedOwnerIds };
    }

    const paymentWhere = buildPaymentPeriodWhere(period.from, period.to, orderOwnerFilter);

    const [paymentsRows, debtOrdersAll, overdueOrdersAll, debtOrders] = await Promise.all([
      this.prisma.payment.findMany({
        where: paymentWhere,
        select: { amount: true, currency: true, amountUsd: true },
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
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const buckets: AgingBucket[] = [
      { label: "0-7", amount: 0, ordersCount: 0 },
      { label: "8-14", amount: 0, ordersCount: 0 },
      { label: "15-30", amount: 0, ordersCount: 0 },
      { label: "31-60", amount: 0, ordersCount: 0 },
      { label: "60+", amount: 0, ordersCount: 0 },
    ];

    for (const o of debtOrders) {
      if (!o.paymentDueDate) continue;
      const due = new Date(o.paymentDueDate);
      due.setHours(0, 0, 0, 0);
      const days = Math.floor((today.getTime() - due.getTime()) / 86400000);
      if (days < 0) continue;
      const debt = toUsd(safeNum(o.debtAmount), o.currency, rates);
      let idx = 4;
      if (days <= 7) idx = 0;
      else if (days <= 14) idx = 1;
      else if (days <= 30) idx = 2;
      else if (days <= 60) idx = 3;
      buckets[idx].amount += debt;
      buckets[idx].ordersCount += 1;
    }

    const byClient = new Map<
      string,
      { name: string | null; debt: number; overdue: number; orders: number }
    >();
    for (const o of await this.prisma.order.findMany({
      where: { ...debtWhere, debtAmount: { gt: 0 }, clientId: { not: null } },
      select: {
        clientId: true,
        debtAmount: true,
        currency: true,
        financialStatus: true,
        client: { select: { firstName: true, lastName: true } },
      },
    })) {
      if (!o.clientId) continue;
      const cur = byClient.get(o.clientId) ?? {
        name: o.client
          ? [o.client.firstName, o.client.lastName].filter(Boolean).join(" ")
          : null,
        debt: 0,
        overdue: 0,
        orders: 0,
      };
      cur.debt += toUsd(safeNum(o.debtAmount), o.currency, rates);
      cur.orders += 1;
      if (o.financialStatus === "OVERDUE") {
        cur.overdue += toUsd(safeNum(o.debtAmount), o.currency, rates);
      }
      byClient.set(o.clientId, cur);
    }

    const topDebtors: TopDebtor[] = [...byClient.entries()]
      .map(([clientId, v]) => ({
        clientId,
        clientName: v.name,
        debtAmount: v.debt,
        overdueAmount: v.overdue,
        orderCount: v.orders,
      }))
      .sort((a, b) => b.debtAmount - a.debtAmount)
      .slice(0, 20);

    const overdueOrdersList = await this.prisma.order.findMany({
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
    });

    let collectedPayments = 0;
    for (const p of paymentsRows) {
      if (p.amountUsd != null) collectedPayments += safeNum(p.amountUsd);
      else collectedPayments += toUsd(safeNum(p.amount), p.currency, rates);
    }
    let debtTotal = 0;
    for (const o of debtOrdersAll) debtTotal += toUsd(safeNum(o.debtAmount), o.currency, rates);
    let overdueDebt = 0;
    for (const o of overdueOrdersAll) overdueDebt += toUsd(safeNum(o.debtAmount), o.currency, rates);

    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "18e84e" },
      body: JSON.stringify({
        sessionId: "18e84e",
        runId: "post-fix",
        hypothesisId: "H12",
        location: "analytics-finance.service.ts:getFinance",
        message: "Finance money conversion to USD",
        data: {
          rates: { UAH_TO_USD: rates.UAH_TO_USD, EUR_TO_USD: rates.EUR_TO_USD },
          collectedPaymentsUsd: Math.round(collectedPayments * 100) / 100,
          debtTotalUsd: Math.round(debtTotal * 100) / 100,
          overdueDebtUsd: Math.round(overdueDebt * 100) / 100,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    return {
      collectedPayments,
      debtTotal,
      overdueDebt,
      agingBuckets: buckets,
      topDebtors,
      overdueOrders: overdueOrdersList.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        clientName: o.client
          ? [o.client.firstName, o.client.lastName].filter(Boolean).join(" ")
          : null,
        debtAmount: toUsd(safeNum(o.debtAmount), o.currency, rates),
        paymentDueDate: o.paymentDueDate?.toISOString() ?? null,
      })),
    };
  }
}
