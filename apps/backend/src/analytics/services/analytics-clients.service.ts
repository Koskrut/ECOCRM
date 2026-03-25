import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { AnalyticsScope } from "../analytics-scope.service";
import { ANALYTICS_EXCLUDED_ORDER_STAGES } from "../analytics.constants";
import { buildPeriodOrderWhere } from "../utils/analytics-filter.builder";
import type { ResolvedPeriod } from "../utils/analytics-date.util";

export type ClientsPayload = {
  newClientsCount: number;
  repeatClientsCount: number;
  sleepingClientsCount: number;
  topByBookedRevenue: {
    clientId: string;
    clientName: string | null;
    bookedRevenue: number;
    ordersCount: number;
  }[];
  topByCollectedPayments: {
    clientId: string;
    clientName: string | null;
    collectedPayments: number;
  }[];
};

@Injectable()
export class AnalyticsClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async getClients(
    period: ResolvedPeriod,
    scope: AnalyticsScope,
  ): Promise<ClientsPayload> {
    if (scope.emptyTeam) {
      return {
        newClientsCount: 0,
        repeatClientsCount: 0,
        sleepingClientsCount: 0,
        topByBookedRevenue: [],
        topByCollectedPayments: [],
      };
    }

    const orderWhere = buildPeriodOrderWhere(period.from, period.to, scope.orderScope);
    const periodOrders = await this.prisma.order.findMany({
      where: { ...orderWhere, clientId: { not: null } },
      select: {
        clientId: true,
        totalAmount: true,
        returnAdjustmentAmount: true,
        client: { select: { firstName: true, lastName: true } },
      },
    });

    const excluded = ANALYTICS_EXCLUDED_ORDER_STAGES.map((s) => `'${s}'::"OrderStage"`).join(", ");
    const clientFirstOrder = await this.prisma.$queryRawUnsafe<{ clientId: string; firstAt: Date }[]>(`
      SELECT "clientId", MIN("createdAt") AS "firstAt"
      FROM "Order"
      WHERE "clientId" IS NOT NULL
        AND ("orderStage" IS NULL OR "orderStage" NOT IN (${excluded}))
      GROUP BY "clientId"
    `);

    const firstMap = new Map(clientFirstOrder.map((r) => [r.clientId, new Date(r.firstAt)]));

    const orderCounts = await this.prisma.$queryRawUnsafe<{ clientId: string; c: bigint }[]>(`
      SELECT "clientId", COUNT(*)::bigint AS c
      FROM "Order"
      WHERE "clientId" IS NOT NULL
        AND ("orderStage" IS NULL OR "orderStage" NOT IN (${excluded}))
      GROUP BY "clientId"
    `);
    const countMap = new Map(orderCounts.map((r) => [r.clientId, Number(r.c)]));

    const clientsInPeriod = new Set(
      periodOrders.map((o) => o.clientId).filter((id): id is string => id != null),
    );

    let newClientsCount = 0;
    let repeatClientsCount = 0;
    for (const cid of clientsInPeriod) {
      const first = firstMap.get(cid);
      if (first && first >= period.from && first <= period.to) {
        newClientsCount += 1;
      }
      if ((countMap.get(cid) ?? 0) >= 2) {
        repeatClientsCount += 1;
      }
    }

    const ninetyAgo = new Date();
    ninetyAgo.setDate(ninetyAgo.getDate() - 90);
    const lastOrders = await this.prisma.$queryRawUnsafe<{ clientId: string; lastAt: Date }[]>(`
      SELECT "clientId", MAX("createdAt") AS "lastAt"
      FROM "Order"
      WHERE "clientId" IS NOT NULL
        AND ("orderStage" IS NULL OR "orderStage" NOT IN (${excluded}))
      GROUP BY "clientId"
    `);
    const lastMap = new Map(lastOrders.map((r) => [r.clientId, new Date(r.lastAt)]));
    let sleepingClientsCount = 0;
    for (const [cid, firstAt] of firstMap) {
      const lastAt = lastMap.get(cid);
      if (!lastAt || lastAt >= ninetyAgo) continue;
      if (firstAt.getTime() < lastAt.getTime()) {
        sleepingClientsCount += 1;
      }
    }

    const bookedByClient = new Map<
      string,
      { name: string | null; booked: number; count: number }
    >();
    for (const o of periodOrders) {
      if (!o.clientId) continue;
      const cur = bookedByClient.get(o.clientId) ?? {
        name: o.client
          ? [o.client.firstName, o.client.lastName].filter(Boolean).join(" ")
          : null,
        booked: 0,
        count: 0,
      };
      const t = Number(o.totalAmount ?? 0);
      const adj = Number(o.returnAdjustmentAmount ?? 0);
      cur.booked += Math.max(0, t - adj);
      cur.count += 1;
      bookedByClient.set(o.clientId, cur);
    }

    const topByBookedRevenue = [...bookedByClient.entries()]
      .map(([clientId, v]) => ({
        clientId,
        clientName: v.name,
        bookedRevenue: v.booked,
        ordersCount: v.count,
      }))
      .sort((a, b) => b.bookedRevenue - a.bookedRevenue)
      .slice(0, 20);

    const orderOwnerFilter: Prisma.OrderWhereInput = {};
    if (scope.orderScope.managerId) {
      orderOwnerFilter.ownerId = scope.orderScope.managerId;
    } else if (
      scope.orderScope.allowedOwnerIds !== undefined &&
      scope.orderScope.allowedOwnerIds.length > 0
    ) {
      orderOwnerFilter.ownerId = { in: scope.orderScope.allowedOwnerIds };
    }

    const payments = await this.prisma.payment.findMany({
      where: {
        status: "COMPLETED",
        paidAt: { gte: period.from, lte: period.to },
        order: {
          ...orderOwnerFilter,
          clientId: { not: null },
        },
      },
      select: {
        amount: true,
        order: {
          select: {
            clientId: true,
            client: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    const paidByClient = new Map<string, { name: string | null; paid: number }>();
    for (const p of payments) {
      const cid = p.order.clientId;
      if (!cid) continue;
      const cur = paidByClient.get(cid) ?? {
        name: p.order.client
          ? [p.order.client.firstName, p.order.client.lastName].filter(Boolean).join(" ")
          : null,
        paid: 0,
      };
      cur.paid += Number(p.amount);
      paidByClient.set(cid, cur);
    }

    const topByCollectedPayments = [...paidByClient.entries()]
      .map(([clientId, v]) => ({
        clientId,
        clientName: v.name,
        collectedPayments: v.paid,
      }))
      .sort((a, b) => b.collectedPayments - a.collectedPayments)
      .slice(0, 20);

    return {
      newClientsCount,
      repeatClientsCount,
      sleepingClientsCount,
      topByBookedRevenue,
      topByCollectedPayments,
    };
  }
}
