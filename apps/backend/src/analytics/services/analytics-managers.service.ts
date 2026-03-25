import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { AnalyticsScope } from "../analytics-scope.service";
import { buildOverdueTaskWhere, buildPaymentPeriodWhere, buildPeriodOrderWhere } from "../utils/analytics-filter.builder";
import type { ResolvedPeriod } from "../utils/analytics-date.util";

export type ManagerRow = {
  id: string;
  name: string;
  bookedRevenue: number;
  collectedPayments: number;
  ordersCount: number;
  avgCheck: number;
  overdueTasks: number;
};

@Injectable()
export class AnalyticsManagersService {
  constructor(private readonly prisma: PrismaService) {}

  async getManagers(
    period: ResolvedPeriod,
    scope: AnalyticsScope,
  ): Promise<{ managers: ManagerRow[] }> {
    if (scope.emptyTeam) {
      return { managers: [] };
    }

    const orderWhere = buildPeriodOrderWhere(period.from, period.to, scope.orderScope);
    const orders = await this.prisma.order.findMany({
      where: orderWhere,
      select: {
        ownerId: true,
        totalAmount: true,
        returnAdjustmentAmount: true,
        owner: { select: { id: true, fullName: true } },
      },
    });

    const byOwner = new Map<
      string,
      { name: string; booked: number; count: number; payments: number }
    >();

    for (const o of orders) {
      if (!o.owner) {
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "18e84e" },
          body: JSON.stringify({
            sessionId: "18e84e",
            runId: "run-managers-backend-1",
            hypothesisId: "H17",
            location: "analytics-managers.service.ts:ordersLoop",
            message: "Order owner relation is null; using fallback name",
            data: { ownerId: o.ownerId },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
      }
      const cur = byOwner.get(o.ownerId) ?? {
        name: o.owner?.fullName ?? o.ownerId,
        booked: 0,
        count: 0,
        payments: 0,
      };
      const t = Number(o.totalAmount ?? 0);
      const adj = Number(o.returnAdjustmentAmount ?? 0);
      cur.booked += Math.max(0, t - adj);
      cur.count += 1;
      cur.name = o.owner?.fullName ?? cur.name;
      byOwner.set(o.ownerId, cur);
    }

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
      where: buildPaymentPeriodWhere(period.from, period.to, orderOwnerFilter),
      select: {
        amount: true,
        order: { select: { ownerId: true } },
      },
    });

    const needNames = new Set<string>();
    for (const p of payments) {
      const oid = p.order.ownerId;
      if (!byOwner.has(oid)) {
        byOwner.set(oid, { name: "", booked: 0, count: 0, payments: 0 });
        needNames.add(oid);
      }
      byOwner.get(oid)!.payments += Number(p.amount);
    }
    if (needNames.size > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: [...needNames] } },
        select: { id: true, fullName: true },
      });
      const nameById = new Map(users.map((u) => [u.id, u.fullName]));
      for (const id of needNames) {
        const row = byOwner.get(id);
        if (row) row.name = nameById.get(id) ?? id;
      }
    }

    const managerIds = [...byOwner.keys()];
    const now = new Date();
    const overdueGroup = await this.prisma.task.groupBy({
      by: ["assigneeId"],
      where: {
        dueAt: { not: null, lt: now },
        status: { in: ["OPEN", "IN_PROGRESS"] },
        assigneeId: { in: managerIds },
      },
      _count: { id: true },
    });
    const overdueMap = new Map(overdueGroup.map((g) => [g.assigneeId, g._count.id]));

    const managers: ManagerRow[] = [...byOwner.entries()].map(([id, v]) => ({
      id,
      name: v.name,
      bookedRevenue: v.booked,
      collectedPayments: v.payments,
      ordersCount: v.count,
      avgCheck: v.count > 0 ? v.booked / v.count : 0,
      overdueTasks: overdueMap.get(id) ?? 0,
    }));

    managers.sort((a, b) => b.bookedRevenue - a.bookedRevenue);
    return { managers };
  }
}
