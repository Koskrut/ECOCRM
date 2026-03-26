import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { AnalyticsScope } from "../analytics-scope.service";
import { buildDebtOrderWhere, buildOverdueTaskWhere } from "../utils/analytics-filter.builder";

@Injectable()
export class AnalyticsAttentionService {
  constructor(private readonly prisma: PrismaService) {}

  async getAttention(scope: AnalyticsScope) {
    if (scope.emptyTeam) {
      return { crm: { overdueTasks: [], stuckOrders: [], leadsWithoutTouch: [] }, finance: { overdueOrders: [] } };
    }

    const [overdueTasks, stuckOrders, leadsWithoutTouch, overdueOrders] = await Promise.all([
      this.prisma.task.findMany({
        where: buildOverdueTaskWhere({ allowedAssigneeIds: scope.allowedAssigneeIds }),
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
      this.fetchStuckOrders(scope),
      this.fetchLeadsWithoutTouch(scope),
      this.prisma.order.findMany({
        where: { ...buildDebtOrderWhere(scope.orderScope), financialStatus: "OVERDUE", debtAmount: { gt: 0 } },
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
    };
  }

  private async fetchStuckOrders(scope: AnalyticsScope) {
    const cutoff = new Date(Date.now() - 3 * 86400000);
    const where: Prisma.OrderWhereInput = {
      OR: [{ orderStage: null }, { orderStage: { notIn: ["CANCELED", "REFUSED", "COMPLETED"] } }],
    };
    if (scope.orderScope.managerId) where.ownerId = scope.orderScope.managerId;
    else if (scope.orderScope.allowedOwnerIds !== undefined) where.ownerId = { in: scope.orderScope.allowedOwnerIds };
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
    return rows
      .map((o) => ({ ...o, stuckSinceDate: (o.statusHistory[0]?.createdAt ?? o.updatedAt) }))
      .filter((o) => o.stuckSinceDate < cutoff)
      .map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        orderStage: o.orderStage,
        stuckSinceDate: o.stuckSinceDate.toISOString(),
        ownerName: o.owner?.fullName ?? null,
      }));
  }

  private async fetchLeadsWithoutTouch(scope: AnalyticsScope) {
    const now = new Date();
    const cutoffNew = new Date(now);
    cutoffNew.setDate(cutoffNew.getDate() - 3);
    const cutoffIp = new Date(now);
    cutoffIp.setDate(cutoffIp.getDate() - 7);
    const ownerFilter: Prisma.LeadWhereInput = {};
    if (scope.orderScope.managerId) ownerFilter.ownerId = scope.orderScope.managerId;
    else if (scope.orderScope.allowedOwnerIds && scope.orderScope.allowedOwnerIds.length > 0) {
      ownerFilter.OR = [{ ownerId: { in: scope.orderScope.allowedOwnerIds } }, { ownerId: null }];
    }
    const [newRows, ipRows] = await Promise.all([
      this.prisma.lead.findMany({
        where: {
          ...ownerFilter,
          status: "NEW",
          createdAt: { lte: cutoffNew },
          NOT: { activities: { some: { createdAt: { gte: cutoffNew } } } },
        },
        take: 25,
        select: { id: true, source: true, fullName: true, name: true, createdAt: true, owner: { select: { fullName: true } } },
      }),
      this.prisma.lead.findMany({
        where: {
          ...ownerFilter,
          status: "IN_PROGRESS",
          createdAt: { lte: cutoffIp },
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

