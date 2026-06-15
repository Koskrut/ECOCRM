import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../../settings/settings.service";
import type { AnalyticsScope } from "../analytics-scope.service";
import { buildPaymentPeriodWhere, buildPeriodOrderWhere } from "../utils/analytics-filter.builder";
import type { ResolvedPeriod } from "../utils/analytics-date.util";
import { getBaseCurrency, paymentToBase, safeNum, toBaseCurrency } from "../utils/analytics-currency.util";

@Injectable()
export class AnalyticsClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async getClients(period: ResolvedPeriod, scope: AnalyticsScope) {
    if (scope.emptyTeam) {
      return {
        currency: "USD",
        newClientsCount: 0,
        repeatClientsCount: 0,
        sleepingClientsCount: 0,
        topByBookedRevenue: [],
        topByCollectedPayments: [],
      };
    }
    const rates = await this.settings.getExchangeRates();
    const currency = getBaseCurrency(rates);
    const orderWhere = buildPeriodOrderWhere(period.from, period.to, scope.orderScope);
    const orders = await this.prisma.order.findMany({
      where: { ...orderWhere, clientId: { not: null } },
      select: {
        clientId: true,
        currency: true,
        totalAmount: true,
        returnAdjustmentAmount: true,
        createdAt: true,
        client: { select: { firstName: true, lastName: true } },
      },
    });
    const allClientOrders = await this.prisma.order.findMany({
      where: { clientId: { not: null } },
      select: { clientId: true, createdAt: true },
    });
    const firstSeen = new Map<string, Date>();
    const totalOrders = new Map<string, number>();
    for (const o of allClientOrders) {
      if (!o.clientId) continue;
      totalOrders.set(o.clientId, (totalOrders.get(o.clientId) ?? 0) + 1);
      const cur = firstSeen.get(o.clientId);
      if (!cur || o.createdAt < cur) firstSeen.set(o.clientId, o.createdAt);
    }
    const bookedMap = new Map<string, { clientName: string | null; bookedRevenue: number; ordersCount: number }>();
    for (const o of orders) {
      if (!o.clientId) continue;
      const cur = bookedMap.get(o.clientId) ?? {
        clientName: o.client ? [o.client.firstName, o.client.lastName].filter(Boolean).join(" ") : null,
        bookedRevenue: 0,
        ordersCount: 0,
      };
      cur.bookedRevenue += toBaseCurrency(
        Math.max(0, safeNum(o.totalAmount) - safeNum(o.returnAdjustmentAmount)),
        o.currency,
        rates,
      );
      cur.ordersCount += 1;
      bookedMap.set(o.clientId, cur);
    }
    const orderOwnerFilter: any = {};
    if (scope.orderScope.managerId) orderOwnerFilter.ownerId = scope.orderScope.managerId;
    else if (scope.orderScope.allowedOwnerIds !== undefined) orderOwnerFilter.ownerId = { in: scope.orderScope.allowedOwnerIds };
    const payments = await this.prisma.payment.findMany({
      where: buildPaymentPeriodWhere(period.from, period.to, orderOwnerFilter),
      select: {
        amount: true,
        amountUsd: true,
        currency: true,
        order: { select: { clientId: true, client: { select: { firstName: true, lastName: true } } } },
      },
    });
    const paidMap = new Map<string, { clientName: string | null; collectedPayments: number }>();
    for (const p of payments) {
      const clientId = p.order.clientId;
      if (!clientId) continue;
      const cur = paidMap.get(clientId) ?? {
        clientName: p.order.client ? [p.order.client.firstName, p.order.client.lastName].filter(Boolean).join(" ") : null,
        collectedPayments: 0,
      };
      cur.collectedPayments += paymentToBase(p.amountUsd, p.amount, p.currency, rates);
      paidMap.set(clientId, cur);
    }

    const ninetyDaysAgo = new Date(period.to);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    let sleepingClientsCount = 0;
    for (const [clientId] of totalOrders) {
      const lastOrder = allClientOrders
        .filter((o) => o.clientId === clientId)
        .reduce<Date | null>((acc, o) => (!acc || o.createdAt > acc ? o.createdAt : acc), null);
      if (lastOrder && lastOrder < ninetyDaysAgo) sleepingClientsCount += 1;
    }

    return {
      currency,
      newClientsCount: [...bookedMap.keys()].filter((id) => {
        const f = firstSeen.get(id);
        return f != null && f >= period.from && f <= period.to;
      }).length,
      repeatClientsCount: [...bookedMap.keys()].filter((id) => (totalOrders.get(id) ?? 0) >= 2).length,
      sleepingClientsCount,
      topByBookedRevenue: [...bookedMap.entries()]
        .map(([clientId, v]) => ({ clientId, ...v }))
        .sort((a, b) => b.bookedRevenue - a.bookedRevenue)
        .slice(0, 20),
      topByCollectedPayments: [...paidMap.entries()]
        .map(([clientId, v]) => ({ clientId, ...v }))
        .sort((a, b) => b.collectedPayments - a.collectedPayments)
        .slice(0, 20),
    };
  }
}

