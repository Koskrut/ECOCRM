import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { AnalyticsScope } from "../analytics-scope.service";
import {
  buildOrderOverduePaymentsWhere,
  buildStuckOrdersBaseWhere,
  filterStuckOrders,
} from "../../orders/orders-attention.util";
import { buildTaskOverdueWhere } from "../../tasks/tasks-attention.util";
import type { ResolvedPeriod } from "../utils/analytics-date.util";

@Injectable()
export class AnalyticsAttentionService {
  constructor(private readonly prisma: PrismaService) {}

  async getAttention(period: ResolvedPeriod, scope: AnalyticsScope) {
    if (scope.emptyTeam) {
      return { crm: { overdueTasks: [], stuckOrders: [], leadsWithoutTouch: [] }, finance: { overdueOrders: [] } };
    }

    const overdueOrderWhere = buildOrderOverduePaymentsWhere({
      managerId: scope.orderScope.managerId,
      allowedOwnerIds: scope.orderScope.allowedOwnerIds,
    });
    const overdueTaskWhere = buildTaskOverdueWhere({
      managerId: scope.orderScope.managerId,
      allowedAssigneeIds: scope.allowedAssigneeIds,
    });

    const [overdueTasks, stuckOrders, leadsWithoutTouch, overdueOrders, riskAlerts] = await Promise.all([
      this.prisma.task.findMany({
        where: overdueTaskWhere,
        orderBy: { dueAt: "asc" },
        take: 50,
        select: {
          id: true,
          title: true,
          dueAt: true,
          assignee: { select: { fullName: true } },
          orderId: true,
          leadId: true,
          contactId: true,
          companyId: true,
        },
      }),
      this.fetchStuckOrders(scope, period),
      this.fetchLeadsWithoutTouch(scope, period),
      this.prisma.order.findMany({
        where: overdueOrderWhere,
        orderBy: { paymentDueDate: "asc" },
        take: 50,
        select: {
          id: true,
          orderNumber: true,
          debtAmount: true,
          paymentDueDate: true,
          client: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.riskScoreSnapshot.findMany({
        where: { band: { in: ["CRITICAL", "HIGH"] } },
        orderBy: { score: "desc" },
        take: 20,
        select: {
          domain: true,
          subjectType: true,
          subjectId: true,
          score: true,
          band: true,
          reasons: true,
        },
      }),
    ]);

    return {
      crm: {
        overdueTasks: overdueTasks.map((t) => ({
          id: t.id,
          title: t.title,
          dueAt: t.dueAt?.toISOString() ?? null,
          assigneeName: t.assignee.fullName,
          relatedEntity: t.orderId ?? t.leadId ?? t.contactId ?? t.companyId ?? null,
        })),
        stuckOrders,
        leadsWithoutTouch,
      },
      finance: {
        overdueOrders: overdueOrders.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          clientName: o.client ? [o.client.firstName, o.client.lastName].filter(Boolean).join(" ") : null,
          debtAmount: Number(o.debtAmount ?? 0),
          paymentDueDate: o.paymentDueDate?.toISOString() ?? null,
        })),
      },
      risk: riskAlerts.map((r) => ({
        domain: r.domain,
        subjectType: r.subjectType,
        subjectId: r.subjectId,
        score: r.score,
        band: r.band,
        reasons: r.reasons,
      })),
    };
  }

  private async fetchStuckOrders(scope: AnalyticsScope, period: ResolvedPeriod) {
    const where = buildStuckOrdersBaseWhere(period, {
      managerId: scope.orderScope.managerId,
      allowedOwnerIds: scope.orderScope.allowedOwnerIds,
    });
    const rows = await this.prisma.order.findMany({
      where,
      take: 50,
      select: {
        id: true,
        orderNumber: true,
        orderStage: true,
        updatedAt: true,
        owner: { select: { fullName: true } },
        statusHistory: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    });
    return filterStuckOrders(rows, period.to).map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      orderStage: o.orderStage,
      stuckSinceDate: (o.statusHistory[0]?.createdAt ?? o.updatedAt).toISOString(),
      ownerName: o.owner?.fullName ?? null,
    }));
  }

  private async fetchLeadsWithoutTouch(scope: AnalyticsScope, period: ResolvedPeriod) {
    const asOf = period.to;
    const cutoffNew = new Date(asOf);
    cutoffNew.setDate(cutoffNew.getDate() - 3);
    const cutoffIp = new Date(asOf);
    cutoffIp.setDate(cutoffIp.getDate() - 7);

    const ownerFilter: Prisma.LeadWhereInput = {};
    if (scope.orderScope.managerId) ownerFilter.ownerId = scope.orderScope.managerId;
    else if (scope.orderScope.allowedOwnerIds && scope.orderScope.allowedOwnerIds.length > 0) {
      ownerFilter.OR = [{ ownerId: { in: scope.orderScope.allowedOwnerIds } }, { ownerId: null }];
    }

    const newUpper = period.to < cutoffNew ? period.to : cutoffNew;
    const ipUpper = period.to < cutoffIp ? period.to : cutoffIp;

    const [newRows, ipRows] = await Promise.all([
      this.prisma.lead.findMany({
        where: {
          ...ownerFilter,
          status: "NEW",
          createdAt: { gte: period.from, lte: newUpper },
          NOT: { activities: { some: { createdAt: { gte: cutoffNew } } } },
        },
        take: 25,
        select: { id: true, source: true, fullName: true, name: true, createdAt: true, owner: { select: { fullName: true } } },
      }),
      this.prisma.lead.findMany({
        where: {
          ...ownerFilter,
          status: "IN_PROGRESS",
          createdAt: { gte: period.from, lte: ipUpper },
          NOT: { activities: { some: { createdAt: { gte: cutoffIp } } } },
        },
        take: 25,
        select: { id: true, source: true, fullName: true, name: true, createdAt: true, owner: { select: { fullName: true } } },
      }),
    ]);
    return [...newRows, ...ipRows].map((l) => ({
      id: l.id,
      name: l.fullName ?? l.name,
      source: l.source,
      createdAt: l.createdAt.toISOString(),
      ownerName: l.owner?.fullName ?? null,
    }));
  }
}
