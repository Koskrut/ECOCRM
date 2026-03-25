import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { AnalyticsScope } from "../analytics-scope.service";
import { ANALYTICS_STUCK_EXCLUDED_STAGES } from "../analytics.constants";
import { buildDebtOrderWhere, buildOverdueTaskWhere } from "../utils/analytics-filter.builder";

export type AttentionPayload = {
  crm: {
    overdueTasks: {
      id: string;
      title: string;
      dueAt: string | null;
      assigneeName: string;
      relatedEntity: string | null;
    }[];
    stuckOrders: {
      id: string;
      orderNumber: string;
      orderStage: string | null;
      stuckSinceDate: string;
      ownerName: string | null;
    }[];
    leadsWithoutTouch: {
      id: string;
      name: string | null;
      source: string;
      createdAt: string;
      ownerName: string | null;
    }[];
  };
  finance: {
    overdueOrders: {
      id: string;
      orderNumber: string;
      clientName: string | null;
      debtAmount: number;
      paymentDueDate: string | null;
    }[];
  };
};

@Injectable()
export class AnalyticsAttentionService {
  constructor(private readonly prisma: PrismaService) {}

  async getAttention(scope: AnalyticsScope): Promise<AttentionPayload> {
    if (scope.emptyTeam) {
      return {
        crm: { overdueTasks: [], stuckOrders: [], leadsWithoutTouch: [] },
        finance: { overdueOrders: [] },
      };
    }

    const overdueWhere = buildOverdueTaskWhere({ allowedAssigneeIds: scope.allowedAssigneeIds });
    const overdueWhereFinance: Prisma.OrderWhereInput = {
      ...buildDebtOrderWhere(scope.orderScope),
      financialStatus: "OVERDUE",
      debtAmount: { gt: 0 },
    };

    const [overdueTasks, stuckOrders, leadsWithoutTouch, overdueOrders] = await Promise.all([
      this.prisma.task.findMany({
        where: overdueWhere,
        take: 50,
        orderBy: { dueAt: "asc" },
        select: {
          id: true,
          title: true,
          dueAt: true,
          assignee: { select: { fullName: true } },
          orderId: true,
          leadId: true,
          contactId: true,
        },
      }),
      this.fetchStuckOrdersList(scope, 50),
      this.fetchLeadsWithoutTouchList(scope, 50),
      this.prisma.order.findMany({
        where: overdueWhereFinance,
        take: 50,
        orderBy: { paymentDueDate: "asc" },
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
          relatedEntity: t.orderId
            ? `order:${t.orderId}`
            : t.leadId
              ? `lead:${t.leadId}`
              : t.contactId
                ? `contact:${t.contactId}`
                : null,
        })),
        stuckOrders,
        leadsWithoutTouch,
      },
      finance: {
        overdueOrders: overdueOrders.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          clientName: o.client
            ? [o.client.firstName, o.client.lastName].filter(Boolean).join(" ")
            : null,
          debtAmount: Number(o.debtAmount ?? 0),
          paymentDueDate: o.paymentDueDate?.toISOString() ?? null,
        })),
      },
    };
  }

  private async fetchStuckOrdersList(
    scope: AnalyticsScope,
    limit: number,
  ): Promise<AttentionPayload["crm"]["stuckOrders"]> {
    const cutoff = new Date(Date.now() - 3 * 86400000);
    const baseWhere: Prisma.OrderWhereInput = {
      OR: [{ orderStage: null }, { orderStage: { notIn: ANALYTICS_STUCK_EXCLUDED_STAGES } }],
    };
    if (scope.orderScope.managerId) {
      baseWhere.ownerId = scope.orderScope.managerId;
    } else if (scope.orderScope.allowedOwnerIds && scope.orderScope.allowedOwnerIds.length > 0) {
      baseWhere.ownerId = { in: scope.orderScope.allowedOwnerIds };
    }

    const orders = await this.prisma.order.findMany({
      where: baseWhere,
      take: 150,
      select: {
        id: true,
        orderNumber: true,
        orderStage: true,
        updatedAt: true,
        owner: { select: { fullName: true } },
        statusHistory: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true, toOrderStage: true },
        },
      },
    });

    const out: AttentionPayload["crm"]["stuckOrders"] = [];
    for (const o of orders) {
      const last = o.statusHistory[0];
      const stageMatch =
        !last ||
        last.toOrderStage === o.orderStage ||
        (last.toOrderStage == null && o.orderStage == null);
      const since = last?.createdAt ?? o.updatedAt;
      if (stageMatch && since < cutoff) {
        out.push({
          id: o.id,
          orderNumber: o.orderNumber,
          orderStage: o.orderStage,
          stuckSinceDate: since.toISOString(),
          ownerName: o.owner?.fullName ?? null,
        });
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  private async fetchLeadsWithoutTouchList(
    scope: AnalyticsScope,
    limit: number,
  ): Promise<AttentionPayload["crm"]["leadsWithoutTouch"]> {
    const now = new Date();
    const cutoffNew = new Date(now);
    cutoffNew.setDate(cutoffNew.getDate() - 3);
    const cutoffIp = new Date(now);
    cutoffIp.setDate(cutoffIp.getDate() - 7);
    const activityWindowNew = new Date(now);
    activityWindowNew.setDate(activityWindowNew.getDate() - 3);
    const activityWindowIp = new Date(now);
    activityWindowIp.setDate(activityWindowIp.getDate() - 7);

    const ownerFilter: Prisma.LeadWhereInput = {};
    if (scope.orderScope.managerId) {
      ownerFilter.ownerId = scope.orderScope.managerId;
    } else if (scope.orderScope.allowedOwnerIds && scope.orderScope.allowedOwnerIds.length > 0) {
      ownerFilter.OR = [
        { ownerId: { in: scope.orderScope.allowedOwnerIds } },
        { ownerId: null },
      ];
    }

    const [newLeads, ipLeads] = await Promise.all([
      this.prisma.lead.findMany({
        where: {
          ...ownerFilter,
          status: "NEW",
          createdAt: { lte: cutoffNew },
          NOT: { activities: { some: { createdAt: { gte: activityWindowNew } } } },
        },
        take: limit,
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          fullName: true,
          source: true,
          createdAt: true,
          owner: { select: { fullName: true } },
        },
      }),
      this.prisma.lead.findMany({
        where: {
          ...ownerFilter,
          status: "IN_PROGRESS",
          createdAt: { lte: cutoffIp },
          NOT: { activities: { some: { createdAt: { gte: activityWindowIp } } } },
        },
        take: limit,
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          fullName: true,
          source: true,
          createdAt: true,
          owner: { select: { fullName: true } },
        },
      }),
    ]);

    const seen = new Set<string>();
    const out: AttentionPayload["crm"]["leadsWithoutTouch"] = [];
    for (const l of [...newLeads, ...ipLeads]) {
      if (seen.has(l.id)) continue;
      seen.add(l.id);
      out.push({
        id: l.id,
        name: l.fullName ?? l.name,
        source: l.source,
        createdAt: l.createdAt.toISOString(),
        ownerName: l.owner?.fullName ?? null,
      });
      if (out.length >= limit) break;
    }
    return out;
  }
}
