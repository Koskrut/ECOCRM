import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { TaskStatus, UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { kyivDayBounds, todayYmdKyiv } from "../crm-timezone";
import { PrismaService } from "../prisma/prisma.service";
import type {
  EmployeeDailyActivityPayload,
  EmployeeDailyActivityRow,
  EmployeeDailyActivitySort,
  EmployeeOrderPreview,
  EmployeeTimelineEvent,
  EmployeeTimelinePayload,
} from "./employee-daily-activity.types";
import {
  auditLooksLikeTtnChange,
  classifyTaskTitle,
  computeActionCount,
  computePresenceStatus,
  formatClientName,
  isAuditNoise,
  overlapActiveSeconds,
  parseActivityDateYmd,
  roundMoney,
  sortActivityRows,
} from "./employee-daily-activity.util";

type UserRow = {
  id: string;
  fullName: string;
  role: UserRole;
  leadId: string | null;
};

function emptyRow(user: UserRow): Omit<EmployeeDailyActivityRow, "actionCount" | "systemSideEffectsCount"> {
  return {
    userId: user.id,
    fullName: user.fullName,
    role: user.role,
    leadId: user.leadId,
    presence: {
      status: "absent",
      firstAt: null,
      lastAt: null,
      activeSeconds: 0,
    },
    payments: {
      count: 0,
      amountsByCurrency: {},
      uniqueOrders: 0,
      matchAudits: 0,
    },
    orders: {
      createdCount: 0,
      statusChangedCount: 0,
      previews: [],
    },
    shipping: {
      shipmentCount: 0,
      ttnCount: 0,
      ttnNumbers: [],
    },
    tasks: {
      created: 0,
      completed: 0,
      byTitleGroup: { paymentControl: 0, callback: 0, other: 0 },
    },
    crm: {
      activities: 0,
      contacts: 0,
      companies: 0,
      leads: 0,
      visits: 0,
    },
  };
}

@Injectable()
export class EmployeeDailyActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(
    actor: AuthUser,
    opts: { dateRaw?: string; leadId?: string; sortRaw?: string },
  ): Promise<EmployeeDailyActivityPayload> {
    let dateYmd: string;
    try {
      dateYmd = parseActivityDateYmd(opts.dateRaw, todayYmdKyiv());
    } catch {
      throw new BadRequestException("Invalid date; use YYYY-MM-DD");
    }
    const { from, to } = kyivDayBounds(dateYmd);
    const sort = this.parseSort(opts.sortRaw);
    const visibleIds = await this.resolveVisibleUserIds(actor, opts.leadId);
    if (visibleIds.length === 0) {
      return { date: dateYmd, sort, rows: [] };
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: visibleIds }, isActive: true },
      select: { id: true, fullName: true, role: true, leadId: true },
      orderBy: { fullName: "asc" },
    });

    const userIds = users.map((u) => u.id);
    const byUser = new Map<string, Omit<EmployeeDailyActivityRow, "actionCount" | "systemSideEffectsCount">>();
    for (const u of users) {
      byUser.set(u.id, emptyRow(u));
    }

    const now = new Date();

    const [
      sessions,
      paymentGroups,
      paymentOrderGroups,
      matchGroups,
      ordersCreatedGroups,
      statusHistoryGroups,
      orderPreviewsRaw,
      statusPreviewsRaw,
      _shipmentGroups,
      _orderTtnGroups,
      ttnAuditRows,
      tasksCreatedGroups,
      tasksCompletedRows,
      activityGroups,
      visitGroups,
      contactGroups,
      companyGroups,
      leadGroups,
      contactAuditGroups,
      companyAuditGroups,
      leadAuditGroups,
      systemAuditGroups,
    ] = await Promise.all([
      this.prisma.userActivitySession.findMany({
        where: {
          userId: { in: userIds },
          startedAt: { lte: to },
          lastSeenAt: { gte: from },
        },
        select: {
          userId: true,
          startedAt: true,
          lastSeenAt: true,
          activeSeconds: true,
        },
      }),
      this.prisma.payment.groupBy({
        by: ["createdByUserId", "currency"],
        where: {
          createdByUserId: { in: userIds },
          createdAt: { gte: from, lte: to },
        },
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.payment.groupBy({
        by: ["createdByUserId", "orderId"],
        where: {
          createdByUserId: { in: userIds },
          createdAt: { gte: from, lte: to },
        },
        _count: { id: true },
      }),
      this.prisma.paymentMatchAudit.groupBy({
        by: ["createdByUserId"],
        where: {
          createdByUserId: { in: userIds },
          createdAt: { gte: from, lte: to },
        },
        _count: { id: true },
      }),
      this.prisma.order.groupBy({
        by: ["ownerId"],
        where: {
          ownerId: { in: userIds },
          createdAt: { gte: from, lte: to },
        },
        _count: { id: true },
      }),
      this.prisma.orderStatusHistory.groupBy({
        by: ["changedBy"],
        where: {
          changedBy: { in: userIds },
          createdAt: { gte: from, lte: to },
        },
        _count: { id: true },
      }),
      this.prisma.order.findMany({
        where: {
          ownerId: { in: userIds },
          createdAt: { gte: from, lte: to },
        },
        select: {
          id: true,
          ownerId: true,
          orderNumber: true,
          totalAmount: true,
          currency: true,
          orderStage: true,
          contact: { select: { firstName: true, lastName: true } },
          company: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      this.prisma.orderStatusHistory.findMany({
        where: {
          changedBy: { in: userIds },
          createdAt: { gte: from, lte: to },
        },
        select: {
          changedBy: true,
          createdAt: true,
          toOrderStage: true,
          order: {
            select: {
              id: true,
              orderNumber: true,
              totalAmount: true,
              currency: true,
              orderStage: true,
              contact: { select: { firstName: true, lastName: true } },
              company: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      this.prisma.shipment.groupBy({
        by: ["orderId"],
        where: {
          createdAt: { gte: from, lte: to },
          order: { ownerId: { in: userIds } },
        },
        _count: { id: true },
      }),
      this.prisma.orderTtn.groupBy({
        by: ["orderId"],
        where: {
          createdAt: { gte: from, lte: to },
          order: { ownerId: { in: userIds } },
        },
        _count: { id: true },
      }),
      this.prisma.auditLog.findMany({
        where: {
          entityType: "Order",
          changedBy: { in: userIds },
          createdAt: { gte: from, lte: to },
        },
        select: {
          changedBy: true,
          after: true,
          diff: true,
        },
      }),
      this.prisma.task.groupBy({
        by: ["createdById"],
        where: {
          createdById: { in: userIds },
          createdAt: { gte: from, lte: to },
        },
        _count: { id: true },
      }),
      this.prisma.task.findMany({
        where: {
          assigneeId: { in: userIds },
          status: TaskStatus.DONE,
          completedAt: { gte: from, lte: to },
        },
        select: { assigneeId: true, title: true },
      }),
      this.prisma.activity.groupBy({
        by: ["createdBy"],
        where: {
          createdBy: { in: userIds },
          createdAt: { gte: from, lte: to },
        },
        _count: { id: true },
      }),
      this.prisma.visit.groupBy({
        by: ["ownerId"],
        where: {
          ownerId: { in: userIds },
          OR: [
            { startsAt: { gte: from, lte: to } },
            { completedAt: { gte: from, lte: to } },
          ],
        },
        _count: { id: true },
      }),
      this.prisma.contact.groupBy({
        by: ["ownerId"],
        where: {
          ownerId: { in: userIds },
          createdAt: { gte: from, lte: to },
        },
        _count: { id: true },
      }),
      this.prisma.company.groupBy({
        by: ["ownerId"],
        where: {
          ownerId: { in: userIds },
          createdAt: { gte: from, lte: to },
        },
        _count: { id: true },
      }),
      this.prisma.lead.groupBy({
        by: ["ownerId"],
        where: {
          ownerId: { in: userIds },
          createdAt: { gte: from, lte: to },
        },
        _count: { id: true },
      }),
      this.prisma.auditLog.groupBy({
        by: ["changedBy"],
        where: {
          entityType: "Contact",
          changedBy: { in: userIds },
          createdAt: { gte: from, lte: to },
          action: { in: ["CREATE", "UPDATE"] },
        },
        _count: { id: true },
      }),
      this.prisma.auditLog.groupBy({
        by: ["changedBy"],
        where: {
          entityType: "Company",
          changedBy: { in: userIds },
          createdAt: { gte: from, lte: to },
          action: { in: ["CREATE", "UPDATE"] },
        },
        _count: { id: true },
      }),
      this.prisma.auditLog.groupBy({
        by: ["changedBy"],
        where: {
          entityType: "Lead",
          changedBy: { in: userIds },
          createdAt: { gte: from, lte: to },
          action: { in: ["CREATE", "UPDATE"] },
        },
        _count: { id: true },
      }),
      this.prisma.auditLog.groupBy({
        by: ["changedBy"],
        where: {
          changedBy: { in: userIds },
          createdAt: { gte: from, lte: to },
          entityType: { in: ["RiskPolicy", "MaterialReservation", "WorkflowExecutionLog", "WorkflowRule"] },
        },
        _count: { id: true },
      }),
    ]);

    // Presence
    const sessionsByUser = new Map<string, typeof sessions>();
    for (const s of sessions) {
      const list = sessionsByUser.get(s.userId) ?? [];
      list.push(s);
      sessionsByUser.set(s.userId, list);
    }
    for (const [uid, list] of sessionsByUser) {
      const row = byUser.get(uid);
      if (!row) continue;
      let activeSeconds = 0;
      let firstAt: Date | null = null;
      let lastAt: Date | null = null;
      for (const s of list) {
        activeSeconds += overlapActiveSeconds(s, from, to);
        if (!firstAt || s.startedAt < firstAt) firstAt = s.startedAt;
        if (!lastAt || s.lastSeenAt > lastAt) lastAt = s.lastSeenAt;
      }
      row.presence = {
        status: computePresenceStatus(lastAt, activeSeconds, now),
        firstAt: firstAt?.toISOString() ?? null,
        lastAt: lastAt?.toISOString() ?? null,
        activeSeconds,
      };
    }

    // Payments
    for (const g of paymentGroups) {
      const uid = g.createdByUserId;
      if (!uid) continue;
      const row = byUser.get(uid);
      if (!row) continue;
      row.payments.count += g._count.id;
      const cur = g.currency || "UAH";
      row.payments.amountsByCurrency[cur] =
        roundMoney((row.payments.amountsByCurrency[cur] ?? 0) + Number(g._sum.amount ?? 0));
    }
    const uniqueOrdersByUser = new Map<string, Set<string>>();
    for (const g of paymentOrderGroups) {
      const uid = g.createdByUserId;
      if (!uid) continue;
      const set = uniqueOrdersByUser.get(uid) ?? new Set<string>();
      set.add(g.orderId);
      uniqueOrdersByUser.set(uid, set);
    }
    for (const [uid, set] of uniqueOrdersByUser) {
      const row = byUser.get(uid);
      if (row) row.payments.uniqueOrders = set.size;
    }
    for (const g of matchGroups) {
      const uid = g.createdByUserId;
      if (!uid) continue;
      const row = byUser.get(uid);
      if (row) row.payments.matchAudits = g._count.id;
    }

    // Orders
    for (const g of ordersCreatedGroups) {
      const row = byUser.get(g.ownerId);
      if (row) row.orders.createdCount = g._count.id;
    }
    for (const g of statusHistoryGroups) {
      const row = byUser.get(g.changedBy);
      if (row) row.orders.statusChangedCount = g._count.id;
    }

    const previewLimit = 3;
    const previewsByUser = new Map<string, EmployeeOrderPreview[]>();
    for (const o of orderPreviewsRaw) {
      const list = previewsByUser.get(o.ownerId) ?? [];
      if (list.length < previewLimit) {
        list.push({
          orderId: o.id,
          orderNumber: o.orderNumber,
          clientName: formatClientName(o),
          amount: o.totalAmount,
          currency: o.currency,
          stage: o.orderStage,
          kind: "created",
        });
      }
      previewsByUser.set(o.ownerId, list);
    }
    for (const h of statusPreviewsRaw) {
      const list = previewsByUser.get(h.changedBy) ?? [];
      if (list.length >= previewLimit) continue;
      list.push({
        orderId: h.order.id,
        orderNumber: h.order.orderNumber,
        clientName: formatClientName(h.order),
        amount: h.order.totalAmount,
        currency: h.order.currency,
        stage: h.toOrderStage ?? h.order.orderStage,
        kind: "status_changed",
      });
      previewsByUser.set(h.changedBy, list);
    }
    for (const [uid, previews] of previewsByUser) {
      const row = byUser.get(uid);
      if (row) row.orders.previews = previews.slice(0, previewLimit);
    }

    // Shipping — TTN by order owner + audit-attributed
    const shipmentOwnerCounts = await this.countShipmentsByOwner(userIds, from, to);
    for (const [uid, count] of shipmentOwnerCounts) {
      const row = byUser.get(uid);
      if (row) row.shipping.shipmentCount = count;
    }

    const ttnDetails = await this.prisma.orderTtn.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        order: { ownerId: { in: userIds } },
      },
      select: {
        documentNumber: true,
        order: { select: { ownerId: true } },
      },
    });
    const ttnByOwner = new Map<string, string[]>();
    for (const t of ttnDetails) {
      const ownerId = t.order?.ownerId;
      if (!ownerId) continue;
      const nums = ttnByOwner.get(ownerId) ?? [];
      if (t.documentNumber) nums.push(t.documentNumber);
      ttnByOwner.set(ownerId, nums);
    }
    for (const [uid, nums] of ttnByOwner) {
      const row = byUser.get(uid);
      if (!row) continue;
      row.shipping.ttnCount = nums.length;
      row.shipping.ttnNumbers = [...new Set(nums)].slice(0, 5);
    }

    for (const audit of ttnAuditRows) {
      if (!auditLooksLikeTtnChange(audit.after, audit.diff)) continue;
      const row = byUser.get(audit.changedBy);
      if (row && row.shipping.ttnCount === 0) {
        row.shipping.ttnCount += 1;
      }
    }

    // Tasks
    for (const g of tasksCreatedGroups) {
      const uid = g.createdById;
      if (!uid) continue;
      const row = byUser.get(uid);
      if (row) row.tasks.created = g._count.id;
    }
    for (const t of tasksCompletedRows) {
      const row = byUser.get(t.assigneeId);
      if (!row) continue;
      row.tasks.completed += 1;
      const group = classifyTaskTitle(t.title);
      row.tasks.byTitleGroup[group] += 1;
    }

    // CRM
    for (const g of activityGroups) {
      const row = byUser.get(g.createdBy);
      if (row) row.crm.activities = g._count.id;
    }
    for (const g of visitGroups) {
      const row = byUser.get(g.ownerId);
      if (row) row.crm.visits = g._count.id;
    }
    for (const g of contactGroups) {
      const uid = g.ownerId;
      if (!uid) continue;
      const row = byUser.get(uid);
      if (row) row.crm.contacts += g._count.id;
    }
    for (const g of companyGroups) {
      const uid = g.ownerId;
      if (!uid) continue;
      const row = byUser.get(uid);
      if (row) row.crm.companies += g._count.id;
    }
    for (const g of leadGroups) {
      const uid = g.ownerId;
      if (!uid) continue;
      const row = byUser.get(uid);
      if (row) row.crm.leads += g._count.id;
    }
    for (const g of contactAuditGroups) {
      const row = byUser.get(g.changedBy);
      if (row) row.crm.contacts += g._count.id;
    }
    for (const g of companyAuditGroups) {
      const row = byUser.get(g.changedBy);
      if (row) row.crm.companies += g._count.id;
    }
    for (const g of leadAuditGroups) {
      const row = byUser.get(g.changedBy);
      if (row) row.crm.leads += g._count.id;
    }

    const rows: EmployeeDailyActivityRow[] = users.map((u) => {
      const base = byUser.get(u.id)!;
      const systemSideEffectsCount =
        systemAuditGroups.find((g) => g.changedBy === u.id)?._count.id ?? 0;
      const actionCount = computeActionCount(base);
      return { ...base, actionCount, systemSideEffectsCount };
    });

    return { date: dateYmd, sort, rows: sortActivityRows(rows, sort) };
  }

  async getTimeline(
    actor: AuthUser,
    userId: string,
    dateRaw?: string,
  ): Promise<EmployeeTimelinePayload> {
    let dateYmd: string;
    try {
      dateYmd = parseActivityDateYmd(dateRaw, todayYmdKyiv());
    } catch {
      throw new BadRequestException("Invalid date; use YYYY-MM-DD");
    }
    const { from, to } = kyivDayBounds(dateYmd);
    const visibleIds = await this.resolveVisibleUserIds(actor);
    if (!visibleIds.includes(userId)) {
      throw new ForbiddenException("User not visible");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true },
    });
    if (!user) throw new NotFoundException("User not found");

    const events: EmployeeTimelineEvent[] = [];

    const [
      payments,
      matchAudits,
      ordersCreated,
      statusHistory,
      tasksCreated,
      tasksCompleted,
      activities,
      visits,
      contacts,
      companies,
      leads,
      audits,
      ttns,
    ] = await Promise.all([
      this.prisma.payment.findMany({
        where: { createdByUserId: userId, createdAt: { gte: from, lte: to } },
        select: {
          id: true,
          createdAt: true,
          amount: true,
          currency: true,
          order: {
            select: {
              orderNumber: true,
              contact: { select: { firstName: true, lastName: true } },
              company: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.paymentMatchAudit.findMany({
        where: { createdByUserId: userId, createdAt: { gte: from, lte: to } },
        select: { id: true, createdAt: true, decision: true, bankTransactionId: true },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.order.findMany({
        where: { ownerId: userId, createdAt: { gte: from, lte: to } },
        select: {
          id: true,
          createdAt: true,
          orderNumber: true,
          totalAmount: true,
          currency: true,
          orderStage: true,
          contact: { select: { firstName: true, lastName: true } },
          company: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.orderStatusHistory.findMany({
        where: { changedBy: userId, createdAt: { gte: from, lte: to } },
        select: {
          id: true,
          createdAt: true,
          toOrderStage: true,
          order: {
            select: {
              id: true,
              orderNumber: true,
              contact: { select: { firstName: true, lastName: true } },
              company: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.task.findMany({
        where: { createdById: userId, createdAt: { gte: from, lte: to } },
        select: { id: true, createdAt: true, title: true },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.task.findMany({
        where: {
          assigneeId: userId,
          status: TaskStatus.DONE,
          completedAt: { gte: from, lte: to },
        },
        select: { id: true, completedAt: true, title: true },
        orderBy: { completedAt: "asc" },
      }),
      this.prisma.activity.findMany({
        where: { createdBy: userId, createdAt: { gte: from, lte: to } },
        select: {
          id: true,
          createdAt: true,
          type: true,
          title: true,
          orderId: true,
          contactId: true,
          leadId: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.visit.findMany({
        where: {
          ownerId: userId,
          OR: [
            { startsAt: { gte: from, lte: to } },
            { completedAt: { gte: from, lte: to } },
          ],
        },
        select: {
          id: true,
          startsAt: true,
          completedAt: true,
          title: true,
          contact: { select: { firstName: true, lastName: true } },
          company: { select: { name: true } },
        },
        orderBy: { startsAt: "asc" },
      }),
      this.prisma.contact.findMany({
        where: { ownerId: userId, createdAt: { gte: from, lte: to } },
        select: { id: true, createdAt: true, firstName: true, lastName: true },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.company.findMany({
        where: { ownerId: userId, createdAt: { gte: from, lte: to } },
        select: { id: true, createdAt: true, name: true },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.lead.findMany({
        where: { ownerId: userId, createdAt: { gte: from, lte: to } },
        select: { id: true, createdAt: true, fullName: true, name: true },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.auditLog.findMany({
        where: {
          changedBy: userId,
          createdAt: { gte: from, lte: to },
          entityType: { notIn: ["UserActivitySession"] },
        },
        select: {
          id: true,
          createdAt: true,
          entityType: true,
          entityId: true,
          action: true,
          changedBy: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.orderTtn.findMany({
        where: {
          createdAt: { gte: from, lte: to },
          order: { ownerId: userId },
        },
        select: {
          id: true,
          createdAt: true,
          documentNumber: true,
          order: { select: { orderNumber: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    for (const p of payments) {
      events.push({
        at: p.createdAt.toISOString(),
        kind: "payment",
        label: `Платіж ${Number(p.amount)} ${p.currency}`,
        entityType: "Payment",
        entityId: p.id,
        orderNumber: p.order.orderNumber,
        clientName: formatClientName(p.order),
        amount: Number(p.amount),
        currency: p.currency,
      });
    }
    for (const m of matchAudits) {
      events.push({
        at: m.createdAt.toISOString(),
        kind: "payment_match",
        label: `Зіставлення банку (${m.decision})`,
        entityType: "PaymentMatchAudit",
        entityId: m.id,
        orderNumber: null,
        clientName: null,
        amount: null,
        currency: null,
      });
    }
    for (const o of ordersCreated) {
      events.push({
        at: o.createdAt.toISOString(),
        kind: "order_created",
        label: `Нове замовлення #${o.orderNumber}`,
        entityType: "Order",
        entityId: o.id,
        orderNumber: o.orderNumber,
        clientName: formatClientName(o),
        amount: o.totalAmount,
        currency: o.currency,
      });
    }
    for (const h of statusHistory) {
      events.push({
        at: h.createdAt.toISOString(),
        kind: "order_status",
        label: `Стадія замовлення → ${h.toOrderStage ?? "?"}`,
        entityType: "Order",
        entityId: h.order.id,
        orderNumber: h.order.orderNumber,
        clientName: formatClientName(h.order),
        amount: null,
        currency: null,
      });
    }
    for (const t of ttns) {
      events.push({
        at: t.createdAt.toISOString(),
        kind: "ttn",
        label: `ТТН ${t.documentNumber}`,
        entityType: "OrderTtn",
        entityId: t.id,
        orderNumber: t.order?.orderNumber ?? null,
        clientName: null,
        amount: null,
        currency: null,
      });
    }
    for (const t of tasksCreated) {
      events.push({
        at: t.createdAt.toISOString(),
        kind: "task_created",
        label: `Задача: ${t.title}`,
        entityType: "Task",
        entityId: t.id,
        orderNumber: null,
        clientName: null,
        amount: null,
        currency: null,
      });
    }
    for (const t of tasksCompleted) {
      if (!t.completedAt) continue;
      events.push({
        at: t.completedAt.toISOString(),
        kind: "task_done",
        label: `Закрито: ${t.title}`,
        entityType: "Task",
        entityId: t.id,
        orderNumber: null,
        clientName: null,
        amount: null,
        currency: null,
      });
    }
    for (const a of activities) {
      events.push({
        at: a.createdAt.toISOString(),
        kind: "activity",
        label: a.title || a.type,
        entityType: "Activity",
        entityId: a.id,
        orderNumber: null,
        clientName: null,
        amount: null,
        currency: null,
      });
    }
    for (const v of visits) {
      const at = (v.completedAt ?? v.startsAt)?.toISOString();
      if (!at) continue;
      events.push({
        at,
        kind: "visit",
        label: v.title || "Візит",
        entityType: "Visit",
        entityId: v.id,
        orderNumber: null,
        clientName: formatClientName(v),
        amount: null,
        currency: null,
      });
    }
    for (const c of contacts) {
      events.push({
        at: c.createdAt.toISOString(),
        kind: "contact",
        label: `Контакт ${c.firstName} ${c.lastName}`.trim(),
        entityType: "Contact",
        entityId: c.id,
        orderNumber: null,
        clientName: null,
        amount: null,
        currency: null,
      });
    }
    for (const c of companies) {
      events.push({
        at: c.createdAt.toISOString(),
        kind: "company",
        label: `Компанія ${c.name}`,
        entityType: "Company",
        entityId: c.id,
        orderNumber: null,
        clientName: null,
        amount: null,
        currency: null,
      });
    }
    for (const l of leads) {
      events.push({
        at: l.createdAt.toISOString(),
        kind: "lead",
        label: `Лід ${l.fullName || l.name || l.id}`,
        entityType: "Lead",
        entityId: l.id,
        orderNumber: null,
        clientName: null,
        amount: null,
        currency: null,
      });
    }
    for (const a of audits) {
      if (isAuditNoise(a.entityType, a.changedBy)) {
        continue;
      }
      if (["Payment", "Order", "Task", "Activity", "Visit", "Contact", "Company", "Lead"].includes(a.entityType)) {
        continue;
      }
      events.push({
        at: a.createdAt.toISOString(),
        kind: "audit",
        label: `${a.action} ${a.entityType}`,
        entityType: a.entityType,
        entityId: a.entityId,
        orderNumber: null,
        clientName: null,
        amount: null,
        currency: null,
        meta: { systemSideEffect: SYSTEM_SIDE_EFFECT_TYPES.has(a.entityType) },
      });
    }

    events.sort((a, b) => a.at.localeCompare(b.at));

    return {
      date: dateYmd,
      userId: user.id,
      fullName: user.fullName,
      events,
    };
  }

  private parseSort(raw: string | undefined): EmployeeDailyActivitySort {
    if (raw === "payments" || raw === "actions") return raw;
    return "activeTime";
  }

  private async resolveVisibleUserIds(actor: AuthUser, leadIdFilter?: string): Promise<string[]> {
    let ids: string[] = [];
    if (actor.role === UserRole.ADMIN) {
      const rows = await this.prisma.user.findMany({
        where: { role: { in: [UserRole.MANAGER, UserRole.LEAD, UserRole.ADMIN] } },
        select: { id: true },
      });
      ids = rows.map((r) => r.id);
    } else if (actor.role === UserRole.LEAD) {
      const team = await this.prisma.user.findMany({
        where: { leadId: actor.id },
        select: { id: true },
      });
      ids = [actor.id, ...team.map((t) => t.id)];
    } else if (actor.role === UserRole.MANAGER) {
      ids = [actor.id];
    }

    const leadTrim = leadIdFilter?.trim();
    if (!leadTrim) return ids;

    const filtered = await this.prisma.user.findMany({
      where: {
        id: { in: ids },
        OR: [{ leadId: leadTrim }, { id: leadTrim }],
      },
      select: { id: true },
    });
    return filtered.map((r) => r.id);
  }

  private async countShipmentsByOwner(
    userIds: string[],
    from: Date,
    to: Date,
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.shipment.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        order: { ownerId: { in: userIds } },
      },
      select: { order: { select: { ownerId: true } } },
    });
    const map = new Map<string, number>();
    for (const r of rows) {
      const uid = r.order.ownerId;
      map.set(uid, (map.get(uid) ?? 0) + 1);
    }
    return map;
  }
}

const SYSTEM_SIDE_EFFECT_TYPES = new Set([
  "RiskPolicy",
  "MaterialReservation",
  "WorkflowExecutionLog",
  "WorkflowRule",
]);
