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
import type { ResolvedPeriod } from "../utils/analytics-date.util";
import { safeNum, toUsd } from "../utils/analytics-currency.util";

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async getManagers(period: ResolvedPeriod, scope: AnalyticsScope): Promise<{ managers: ManagerRow[] }> {
    if (scope.emptyTeam) return { managers: [] };
    const rates = await this.settings.getExchangeRates();
    const orderWhere = buildPeriodOrderWhere(period.from, period.to, scope.orderScope);
    const orders = await this.prisma.order.findMany({
      where: orderWhere,
      select: {
        ownerId: true,
        totalAmount: true,
        returnAdjustmentAmount: true,
        currency: true,
        owner: { select: { id: true, fullName: true } },
      },
    });

    // PERF: one findMany over all period orders + payments findMany; OK for typical volumes. Hot path → aggregate SQL.
    const byOwner = new Map<string, { name: string; booked: number; count: number; payments: number }>();
    for (const o of orders) {
      const cur = byOwner.get(o.ownerId) ?? {
        name: o.owner?.fullName ?? o.ownerId,
        booked: 0,
        count: 0,
        payments: 0,
      };
      cur.booked += toUsd(
        Math.max(0, safeNum(o.totalAmount) - safeNum(o.returnAdjustmentAmount)),
        o.currency,
        rates,
      );
      cur.count += 1;
      cur.name = o.owner?.fullName ?? cur.name;
      byOwner.set(o.ownerId, cur);
    }

    const orderOwnerFilter: Prisma.OrderWhereInput = {};
    if (scope.orderScope.managerId) orderOwnerFilter.ownerId = scope.orderScope.managerId;
    else if (scope.orderScope.allowedOwnerIds !== undefined) {
      orderOwnerFilter.ownerId = { in: scope.orderScope.allowedOwnerIds };
    }

    const payments = await this.prisma.payment.findMany({
      where: buildPaymentPeriodWhere(period.from, period.to, orderOwnerFilter),
      select: { amount: true, currency: true, amountUsd: true, order: { select: { ownerId: true } } },
    });
    const needNames = new Set<string>();
    for (const p of payments) {
      const oid = p.order.ownerId;
      if (!byOwner.has(oid)) {
        byOwner.set(oid, { name: "", booked: 0, count: 0, payments: 0 });
        needNames.add(oid);
      }
      byOwner.get(oid)!.payments += p.amountUsd != null ? safeNum(p.amountUsd) : toUsd(safeNum(p.amount), p.currency, rates);
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
    const overdueTaskBase = buildOverdueTaskWhereForPeriod(period.from, period.to, {
      managerId: scope.orderScope.managerId,
      allowedAssigneeIds: scope.allowedAssigneeIds,
    });
    const overdueGroup = await this.prisma.task.groupBy({
      by: ["assigneeId"],
      where: { ...overdueTaskBase, assigneeId: { in: managerIds } },
      _count: { id: true },
    });
    const overdueMap = new Map(overdueGroup.map((g) => [g.assigneeId, g._count.id]));

    const managers = [...byOwner.entries()]
      .map(([id, v]) => ({
        id,
        name: v.name,
        bookedRevenue: v.booked,
        collectedPayments: v.payments,
        ordersCount: v.count,
        avgCheck: v.count > 0 ? v.booked / v.count : 0,
        overdueTasks: overdueMap.get(id) ?? 0,
      }))
      .sort((a, b) => b.bookedRevenue - a.bookedRevenue);
    return { managers };
  }
}

