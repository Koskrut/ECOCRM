import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CallQueueItemStatus,
  DailyWorkPlanItemKind,
  DailyWorkPlanItemStatus,
  DailyWorkPlanStatus,
  LeadEventType,
  LeadStatus,
  TaskStatus,
  UserRole,
  VisitStatus,
} from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { ContactsWorkQueueService } from "../contacts/contacts-work-queue.service";
import { kyivDayBounds, todayYmdKyiv } from "../crm-timezone";
import { PrismaService } from "../prisma/prisma.service";
import {
  computeCompletion,
  shouldAutoCompleteItem,
  type CompletionFacts,
} from "./daily-agenda.completion";
import { daysBetween, leadDisplayName } from "./daily-agenda.helpers";
import {
  buildDefaultProposal,
  buildSmartDefaultProposal,
  itemSourceKey,
  mergeRecommitItems,
} from "./daily-agenda.proposal";
import {
  buildAgendaSummary,
  buildSuggestions,
  groupSuggestions,
  pickSeedSuggestions,
  planKeysFromItems,
} from "./daily-agenda.suggestions";
import { financialOverdueWhere } from "../orders/order-status-sync.mapper";
import { buildOperationalDebtOrderWhere } from "../receivables/receivables-scope.util";
import type {
  AgendaPlanItem,
  AgendaPlanItemInput,
  DailyAgendaPayload,
  DailyAgendaProfile,
  SaveAgendaBody,
  ScheduledContactAction,
  ScheduledTask,
  ScheduledVisit,
} from "./daily-agenda.types";

const DATE_YMD = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class DailyAgendaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workQueue: ContactsWorkQueueService,
  ) {}

  async getAgenda(
    dateRaw: string | undefined,
    actor: AuthUser,
    requestedUserId?: string,
  ): Promise<DailyAgendaPayload> {
    const dateYmd = this.parseDate(dateRaw);
    const userId = requestedUserId?.trim() || actor.id;
    this.assertSelfOnly(actor, userId);

    const profile = await this.resolveProfile(userId);
    const scheduled = await this.loadScheduled(userId, dateYmd);

    let plan = await this.prisma.dailyWorkPlan.findUnique({
      where: { userId_date: { userId, date: dateYmd } },
      include: { items: { orderBy: { position: "asc" } } },
    });

    if (plan?.status === DailyWorkPlanStatus.COMMITTED) {
      await this.syncPlanCompletion(plan.id, userId, dateYmd);
      plan = await this.prisma.dailyWorkPlan.findUnique({
        where: { id: plan.id },
        include: { items: { orderBy: { position: "asc" } } },
      });
    }

    const planItems = plan?.items ?? [];
    const planKeys = planKeysFromItems(planItems);

    const [overdueTasks, backlogVisits, queueContacts, hotLeads, newLeads, overdueOrders, callQueueItems, debtContacts, missedCalls] =
      await Promise.all([
        this.loadOverdueTasks(userId, dateYmd),
        profile === "field" ? this.loadBacklogVisits(userId) : Promise.resolve([]),
        profile === "office" ? this.loadQueueContacts(actor) : Promise.resolve([]),
        profile === "office" ? this.loadHotLeads(userId) : Promise.resolve([]),
        profile === "office" ? this.loadNewLeads(userId) : Promise.resolve([]),
        this.loadOverdueOrders(userId),
        profile === "office" ? this.loadCallQueueItems(userId) : Promise.resolve([]),
        profile === "office" ? this.loadDebtContacts(actor) : Promise.resolve([]),
        profile === "office" ? this.loadMissedCalls(userId, dateYmd) : Promise.resolve([]),
      ]);

    const availableSuggestions = buildSuggestions({
      profile,
      visits: scheduled.visits,
      tasks: scheduled.tasks,
      contactActions: scheduled.contactActions,
      backlogVisits,
      overdueTasks,
      queueContacts,
      hotLeads,
      newLeads,
      overdueOrders,
      callQueueItems,
      debtContacts,
      missedCalls,
      planKeys,
    });

    const groupedSuggestions = groupSuggestions(availableSuggestions);

    const scheduledProposal =
      plan == null
        ? buildDefaultProposal({
            visits: scheduled.visits,
            tasks: scheduled.tasks,
            contactActions: scheduled.contactActions,
            dateYmd,
          })
        : [];

    const defaultProposal =
      plan == null
        ? buildSmartDefaultProposal({
            scheduled: scheduledProposal,
            seedSuggestions: pickSeedSuggestions({ profile, suggestions: availableSuggestions }),
          })
        : null;

    const mappedPlan = plan
      ? {
          id: plan.id,
          status: plan.status as DailyAgendaPayload["plan"] extends infer P
            ? P extends { status: infer S }
              ? S
              : never
            : never,
          committedAt: plan.committedAt?.toISOString() ?? null,
          items: plan.items.map((i) => this.mapItem(i)),
        }
      : null;

    const completion =
      plan?.status === DailyWorkPlanStatus.COMMITTED
        ? computeCompletion(plan.items)
        : null;

    const planItemsForSummary =
      mappedPlan?.items.map(({ id: _id, completedAt: _c, completedBy: _b, ...rest }) => rest) ??
      defaultProposal ??
      [];

    const summary = buildAgendaSummary({
      scheduled,
      suggestions: availableSuggestions,
      planItems: planItemsForSummary,
    });

    return {
      date: dateYmd,
      userId,
      profile,
      plan: mappedPlan,
      completion,
      defaultProposal,
      scheduled,
      availableSuggestions,
      groupedSuggestions,
      summary,
    };
  }

  async saveDraft(body: SaveAgendaBody, actor: AuthUser): Promise<DailyAgendaPayload> {
    const dateYmd = this.parseDate(body.date);
    this.assertSelfOnly(actor, actor.id);
    await this.upsertPlan(actor.id, dateYmd, body.items, DailyWorkPlanStatus.DRAFT, null);
    return this.getAgenda(dateYmd, actor);
  }

  async commitPlan(body: SaveAgendaBody, actor: AuthUser): Promise<DailyAgendaPayload> {
    const dateYmd = this.parseDate(body.date);
    this.assertSelfOnly(actor, actor.id);

    const existing = await this.prisma.dailyWorkPlan.findUnique({
      where: { userId_date: { userId: actor.id, date: dateYmd } },
      include: { items: true },
    });

    let items = body.items;
    if (existing?.status === DailyWorkPlanStatus.COMMITTED) {
      const doneItems = existing.items
        .filter((i) => i.status === DailyWorkPlanItemStatus.DONE)
        .map((i) => this.dbItemToInput(i));
      items = mergeRecommitItems(doneItems, body.items);
    }

    await this.upsertPlan(
      actor.id,
      dateYmd,
      items,
      DailyWorkPlanStatus.COMMITTED,
      new Date(),
    );
    return this.getAgenda(dateYmd, actor);
  }

  async patchItem(
    itemId: string,
    status: DailyWorkPlanItemStatus,
    actor: AuthUser,
  ): Promise<DailyAgendaPayload> {
    const item = await this.prisma.dailyWorkPlanItem.findUnique({
      where: { id: itemId },
      include: { plan: true },
    });
    if (!item) throw new NotFoundException("Plan item not found");
    this.assertSelfOnly(actor, item.plan.userId);

    if (status !== DailyWorkPlanItemStatus.DONE && status !== DailyWorkPlanItemStatus.DISMISSED) {
      throw new BadRequestException("Invalid status");
    }
    if (item.status === DailyWorkPlanItemStatus.DONE && status === DailyWorkPlanItemStatus.DISMISSED) {
      throw new BadRequestException("Cannot dismiss a completed item");
    }

    await this.prisma.dailyWorkPlanItem.update({
      where: { id: itemId },
      data: {
        status,
        completedAt: status === DailyWorkPlanItemStatus.DONE ? new Date() : item.completedAt,
        completedBy: status === DailyWorkPlanItemStatus.DONE ? "MANUAL" : item.completedBy,
      },
    });

    return this.getAgenda(item.plan.date, actor);
  }

  private async upsertPlan(
    userId: string,
    dateYmd: string,
    items: AgendaPlanItemInput[],
    status: DailyWorkPlanStatus,
    committedAt: Date | null,
  ): Promise<void> {
    await this.validateItems(userId, items);

    const doneByKey = new Map<string, { completedAt: Date | null; completedBy: string | null }>();
    const existingPlan = await this.prisma.dailyWorkPlan.findUnique({
      where: { userId_date: { userId, date: dateYmd } },
      include: { items: true },
    });
    if (existingPlan) {
      for (const i of existingPlan.items.filter((x) => x.status === DailyWorkPlanItemStatus.DONE)) {
        doneByKey.set(itemSourceKey(i), {
          completedAt: i.completedAt,
          completedBy: i.completedBy,
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const plan = await tx.dailyWorkPlan.upsert({
        where: { userId_date: { userId, date: dateYmd } },
        create: {
          userId,
          date: dateYmd,
          status,
          committedAt,
        },
        update: {
          status,
          committedAt: committedAt ?? undefined,
        },
      });

      await tx.dailyWorkPlanItem.deleteMany({ where: { planId: plan.id } });

      if (items.length > 0) {
        await tx.dailyWorkPlanItem.createMany({
          data: items.map((item, idx) => {
            const key = itemSourceKey(item);
            const preserved = doneByKey.get(key);
            const isDone = preserved != null;
            return {
              planId: plan.id,
              kind: item.kind as DailyWorkPlanItemKind,
              status: isDone
                ? DailyWorkPlanItemStatus.DONE
                : ((item.status ?? "PLANNED") as DailyWorkPlanItemStatus),
              position: item.position ?? idx,
              visitId: item.visitId ?? null,
              taskId: item.taskId ?? null,
              contactId: item.contactId ?? null,
              leadId: item.leadId ?? null,
              title: item.title,
              subtitle: item.subtitle ?? null,
              scheduledAt: item.scheduledAt ? new Date(item.scheduledAt) : null,
              completedAt: preserved?.completedAt ?? null,
              completedBy: preserved?.completedBy ?? null,
              metadata: item.metadata ?? undefined,
            };
          }),
        });
      }
    });
  }

  private async syncPlanCompletion(
    planId: string,
    userId: string,
    dateYmd: string,
  ): Promise<void> {
    const items = await this.prisma.dailyWorkPlanItem.findMany({
      where: { planId, status: DailyWorkPlanItemStatus.PLANNED },
    });
    if (items.length === 0) return;

    const facts = await this.loadCompletionFacts(userId, dateYmd);
    const now = new Date();

    for (const item of items) {
      const mapped = this.mapItem(item);
      if (!shouldAutoCompleteItem(mapped, facts)) continue;
      await this.prisma.dailyWorkPlanItem.update({
        where: { id: item.id },
        data: {
          status: DailyWorkPlanItemStatus.DONE,
          completedAt: now,
          completedBy: "AUTO",
        },
      });
    }
  }

  private async loadCompletionFacts(
    userId: string,
    dateYmd: string,
  ): Promise<CompletionFacts> {
    const { from, to } = kyivDayBounds(dateYmd);
    const dayStart = from;

    const [doneVisits, doneTasks, outboundCalls, contactsWithActions, leadEvents, paymentsToday] =
      await Promise.all([
        this.prisma.visit.findMany({
          where: {
            ownerId: userId,
            status: VisitStatus.DONE,
            startsAt: { gte: from, lte: to },
          },
          select: { id: true, contactId: true },
        }),
        this.prisma.task.findMany({
          where: {
            assigneeId: userId,
            status: TaskStatus.DONE,
            OR: [{ completedAt: { gte: from, lte: to } }, { updatedAt: { gte: from, lte: to } }],
          },
          select: { id: true },
        }),
        this.prisma.call.findMany({
          where: {
            managerUserId: userId,
            startedAt: { gte: from, lte: to },
            direction: { equals: "OUTBOUND", mode: "insensitive" },
            contactId: { not: null },
          },
          select: { contactId: true },
        }),
        this.prisma.contact.findMany({
          where: { ownerId: userId },
          select: { id: true, nextActionAt: true, nextActionType: true },
        }),
        this.prisma.leadEvent.findMany({
          where: {
            type: LeadEventType.STATUS_CHANGED,
            createdAt: { gte: from, lte: to },
            lead: { ownerId: userId },
          },
          select: { leadId: true },
        }),
        this.prisma.payment.findMany({
          where: {
            order: { ownerId: userId },
            createdAt: { gte: from, lte: to },
          },
          select: { orderId: true },
        }),
      ]);

    const contactNextActionChanged = new Set<string>();
    for (const c of contactsWithActions) {
      if (!c.nextActionAt) {
        contactNextActionChanged.add(c.id);
        continue;
      }
      if (c.nextActionAt < dayStart || c.nextActionAt > to) {
        contactNextActionChanged.add(c.id);
      }
    }

    const processedLeads = await this.prisma.lead.findMany({
      where: {
        ownerId: userId,
        OR: [
          { status: { not: LeadStatus.NEW } },
          { events: { some: { type: LeadEventType.STATUS_CHANGED, createdAt: { gte: from, lte: to } } } },
        ],
      },
      select: { id: true },
    });

    return {
      doneVisitIds: new Set(doneVisits.map((v) => v.id)),
      doneTaskIds: new Set(doneTasks.map((t) => t.id)),
      calledContactIds: new Set(
        outboundCalls.map((c) => c.contactId).filter((id): id is string => id != null),
      ),
      doneVisitContactIds: new Set(
        doneVisits.map((v) => v.contactId).filter((id): id is string => id != null),
      ),
      contactNextActionChanged,
      processedLeadIds: new Set([
        ...leadEvents.map((e) => e.leadId),
        ...processedLeads.map((l) => l.id),
      ]),
      paidOrderIds: new Set(paymentsToday.map((p) => p.orderId)),
    };
  }

  private async loadScheduled(
    userId: string,
    dateYmd: string,
  ): Promise<DailyAgendaPayload["scheduled"]> {
    const { from, to } = kyivDayBounds(dateYmd);

    const [visits, tasks, contacts] = await Promise.all([
      this.prisma.visit.findMany({
        where: {
          ownerId: userId,
          status: { in: [VisitStatus.SCHEDULED, VisitStatus.IN_PROGRESS, VisitStatus.DONE] },
          startsAt: { gte: from, lte: to },
        },
        orderBy: { startsAt: "asc" },
        include: {
          contact: { select: { firstName: true, lastName: true } },
          company: { select: { name: true } },
        },
      }),
      this.prisma.task.findMany({
        where: {
          assigneeId: userId,
          status: { in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS, TaskStatus.DONE] },
          dueAt: { gte: from, lte: to },
        },
        orderBy: { dueAt: "asc" },
        include: {
          contact: { select: { firstName: true, lastName: true } },
          company: { select: { name: true } },
          lead: {
            select: {
              firstName: true,
              lastName: true,
              middleName: true,
              companyName: true,
              fullName: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.contact.findMany({
        where: {
          ownerId: userId,
          nextActionAt: { gte: from, lte: to },
          nextActionType: { not: "NO_ACTION" },
        },
        orderBy: { nextActionAt: "asc" },
        include: { company: { select: { name: true } } },
      }),
    ]);

    return {
      visits: visits.map(
        (v): ScheduledVisit => ({
          id: v.id,
          title: v.title,
          status: v.status,
          startsAt: v.startsAt?.toISOString() ?? null,
          endsAt: v.endsAt?.toISOString() ?? null,
          contactId: v.contactId,
          companyName: v.company?.name ?? null,
          contactName: v.contact
            ? `${v.contact.firstName} ${v.contact.lastName}`.trim()
            : null,
          purpose: v.purpose,
        }),
      ),
      tasks: tasks.map((t) => this.mapTaskRow(t, from)),
      contactActions: contacts.map(
        (c): ScheduledContactAction => ({
          contactId: c.id,
          fullName: `${c.firstName} ${c.lastName}`.trim(),
          nextActionType: c.nextActionType ?? "",
          nextActionAt: c.nextActionAt?.toISOString() ?? null,
          nextActionNote: c.nextActionNote,
          phone: c.phone,
          companyName: c.company?.name ?? null,
          clientStage: c.clientStage,
        }),
      ),
    };
  }

  private mapTaskRow(
    t: {
      id: string;
      title: string;
      dueAt: Date | null;
      status: string;
      contactId: string | null;
      leadId: string | null;
      contact: { firstName: string; lastName: string } | null;
      company: { name: string } | null;
      lead: {
        firstName: string | null;
        lastName: string | null;
        middleName: string | null;
        companyName: string | null;
        fullName: string | null;
        name: string | null;
      } | null;
    },
    dayStart: Date,
  ): ScheduledTask {
    return {
      id: t.id,
      title: t.title,
      dueAt: t.dueAt?.toISOString() ?? null,
      status: t.status,
      contactId: t.contactId,
      leadId: t.leadId,
      contactName: t.contact
        ? `${t.contact.firstName} ${t.contact.lastName}`.trim()
        : null,
      companyName: t.company?.name ?? null,
      leadName: t.lead ? leadDisplayName(t.lead) : null,
      daysOverdue: daysBetween(t.dueAt?.toISOString() ?? null, dayStart),
    };
  }

  private async loadOverdueTasks(userId: string, dateYmd: string): Promise<ScheduledTask[]> {
    const { from } = kyivDayBounds(dateYmd);
    const rows = await this.prisma.task.findMany({
      where: {
        assigneeId: userId,
        status: { in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS] },
        dueAt: { lt: from },
      },
      orderBy: { dueAt: "asc" },
      take: 10,
      include: {
        contact: { select: { firstName: true, lastName: true } },
        company: { select: { name: true } },
        lead: {
          select: {
            firstName: true,
            lastName: true,
            middleName: true,
            companyName: true,
            fullName: true,
            name: true,
          },
        },
      },
    });
    return rows.map((t) => this.mapTaskRow(t, from));
  }

  private async loadBacklogVisits(userId: string): Promise<ScheduledVisit[]> {
    const rows = await this.prisma.visit.findMany({
      where: {
        ownerId: userId,
        status: VisitStatus.PLANNED_UNASSIGNED,
      },
      orderBy: { createdAt: "asc" },
      take: 10,
      include: {
        contact: { select: { firstName: true, lastName: true } },
        company: { select: { name: true } },
      },
    });
    return rows.map((v) => ({
      id: v.id,
      title: v.title,
      status: v.status,
      startsAt: null,
      endsAt: null,
      contactId: v.contactId,
      companyName: v.company?.name ?? null,
      contactName: v.contact ? `${v.contact.firstName} ${v.contact.lastName}`.trim() : null,
      purpose: v.purpose,
    }));
  }

  private async loadQueueContacts(actor: AuthUser) {
    try {
      const result = await this.workQueue.getWorkQueue(
        { preset: "attention", page: 1, pageSize: 10, ownerId: actor.id },
        actor,
      );
      const items = Array.isArray(result.items) ? result.items : [];
      return items.map(
        (row: {
          contact: {
            id: string;
            fullName: string;
            phone: string | null;
            companyName: string | null;
          };
          priorityScore: number;
          priorityReasons: string[];
        }) => ({
          contactId: row.contact.id,
          fullName: row.contact.fullName,
          phone: row.contact.phone,
          companyName: row.contact.companyName,
          priorityScore: row.priorityScore,
          priorityReasons: row.priorityReasons,
        }),
      );
    } catch {
      return [];
    }
  }

  private async loadHotLeads(ownerId: string) {
    const now = new Date();
    const rows = await this.prisma.lead.findMany({
      where: { ownerId, status: LeadStatus.IN_PROGRESS },
      orderBy: [{ lastActivityAt: "asc" }, { updatedAt: "asc" }],
      take: 3,
      select: {
        id: true,
        status: true,
        source: true,
        companyName: true,
        name: true,
        firstName: true,
        lastName: true,
        middleName: true,
        fullName: true,
        createdAt: true,
        lastActivityAt: true,
      },
    });
    return rows.map((lead) => {
      const reference = lead.lastActivityAt ?? lead.createdAt;
      const daysSinceActivity = reference
        ? Math.max(0, Math.floor((now.getTime() - reference.getTime()) / 86400000))
        : null;
      return {
        id: lead.id,
        name: leadDisplayName(lead),
        source: lead.source ?? null,
        daysSinceActivity,
        status: lead.status,
        companyName: lead.companyName ?? null,
      };
    });
  }

  private async loadNewLeads(ownerId: string) {
    const rows = await this.prisma.lead.findMany({
      where: { ownerId, status: LeadStatus.NEW },
      orderBy: { createdAt: "asc" },
      take: 3,
      select: {
        id: true,
        status: true,
        source: true,
        companyName: true,
        name: true,
        firstName: true,
        lastName: true,
        middleName: true,
        fullName: true,
        createdAt: true,
        lastActivityAt: true,
      },
    });
    return rows.map((lead) => ({
      id: lead.id,
      name: leadDisplayName(lead),
      source: lead.source ?? null,
      daysSinceActivity: null,
      status: lead.status,
      companyName: lead.companyName ?? null,
    }));
  }

  private async loadOverdueOrders(ownerId: string) {
    const rows = await this.prisma.order.findMany({
      where: buildOperationalDebtOrderWhere({
        ownerId,
        ...financialOverdueWhere(),
      }),
      orderBy: { paymentDueDate: "asc" },
      take: 5,
      select: {
        id: true,
        orderNumber: true,
        debtAmount: true,
        currency: true,
        paymentDueDate: true,
        company: { select: { name: true } },
        client: { select: { firstName: true, lastName: true } },
      },
    });
    const now = new Date();
    return rows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      debtAmount: o.debtAmount,
      currency: o.currency,
      contactName: o.client ? `${o.client.firstName} ${o.client.lastName}`.trim() : null,
      companyName: o.company?.name ?? null,
      daysOverdue: o.paymentDueDate
        ? Math.max(1, Math.floor((now.getTime() - o.paymentDueDate.getTime()) / 86400000))
        : null,
    }));
  }

  private async loadCallQueueItems(assigneeId: string) {
    const rows = await this.prisma.callQueueItem.findMany({
      where: { assigneeId, status: CallQueueItemStatus.PENDING },
      orderBy: { sortOrder: "asc" },
      take: 5,
      include: {
        contact: { select: { firstName: true, lastName: true, phone: true } },
        lead: {
          select: {
            firstName: true,
            lastName: true,
            middleName: true,
            companyName: true,
            fullName: true,
            name: true,
            phone: true,
          },
        },
        company: { select: { name: true } },
      },
    });
    return rows.map((item) => ({
      queueItemId: item.id,
      contactId: item.contactId,
      leadId: item.leadId,
      contactName: item.contact
        ? `${item.contact.firstName} ${item.contact.lastName}`.trim()
        : null,
      leadName: item.lead ? leadDisplayName(item.lead) : null,
      phone: item.contact?.phone ?? item.lead?.phone ?? null,
      companyName: item.company?.name ?? item.lead?.companyName ?? null,
    }));
  }

  private async loadDebtContacts(actor: AuthUser) {
    try {
      const result = await this.workQueue.getWorkQueue(
        { preset: "debt-control", page: 1, pageSize: 5, ownerId: actor.id },
        actor,
      );
      const items = Array.isArray(result.items) ? result.items : [];
      return items.map(
        (row: {
          contact: { id: string; fullName: string; phone: string | null; companyName: string | null };
          priorityScore: number;
          metrics: { debtAmount: number };
        }) => ({
          contactId: row.contact.id,
          fullName: row.contact.fullName,
          phone: row.contact.phone,
          companyName: row.contact.companyName,
          debtAmount: row.metrics.debtAmount,
          priorityScore: row.priorityScore,
        }),
      );
    } catch {
      return [];
    }
  }

  private async loadMissedCalls(userId: string, dateYmd: string) {
    const { from, to } = kyivDayBounds(dateYmd);
    const rows = await this.prisma.call.findMany({
      where: {
        managerUserId: userId,
        direction: { equals: "INBOUND", mode: "insensitive" },
        startedAt: { gte: from, lte: to },
        OR: [
          { status: { contains: "missed", mode: "insensitive" } },
          { status: { contains: "noanswer", mode: "insensitive" } },
        ],
        contactId: { not: null },
      },
      orderBy: { startedAt: "desc" },
      take: 5,
      select: {
        id: true,
        contactId: true,
        leadId: true,
        from: true,
      },
    });

    const contactIds = rows.map((c) => c.contactId).filter((id): id is string => id != null);
    const contacts =
      contactIds.length > 0
        ? await this.prisma.contact.findMany({
            where: { id: { in: contactIds } },
            select: { id: true, firstName: true, lastName: true, phone: true },
          })
        : [];
    const contactById = new Map(contacts.map((c) => [c.id, c]));

    const outboundToday = await this.prisma.call.findMany({
      where: {
        managerUserId: userId,
        direction: { equals: "OUTBOUND", mode: "insensitive" },
        startedAt: { gte: from, lte: to },
        contactId: { not: null },
      },
      select: { contactId: true },
    });
    const calledBack = new Set(
      outboundToday.map((c) => c.contactId).filter((id): id is string => id != null),
    );

    return rows
      .filter((c) => c.contactId && !calledBack.has(c.contactId))
      .map((c) => {
        const contact = c.contactId ? contactById.get(c.contactId) : undefined;
        return {
          callId: c.id,
          contactId: c.contactId,
          leadId: c.leadId,
          contactName: contact
            ? `${contact.firstName} ${contact.lastName}`.trim()
            : null,
          phone: contact?.phone ?? c.from,
        };
      });
  }

  private async validateItems(userId: string, items: AgendaPlanItemInput[]): Promise<void> {
    for (const item of items) {
      if (item.visitId) {
        const v = await this.prisma.visit.findFirst({
          where: { id: item.visitId, ownerId: userId },
        });
        if (!v) throw new BadRequestException(`Visit ${item.visitId} not found`);
      }
      if (item.taskId) {
        const t = await this.prisma.task.findFirst({
          where: { id: item.taskId, assigneeId: userId },
        });
        if (!t) throw new BadRequestException(`Task ${item.taskId} not found`);
      }
      if (item.contactId) {
        const c = await this.prisma.contact.findFirst({
          where: { id: item.contactId, ownerId: userId },
        });
        if (!c) throw new BadRequestException(`Contact ${item.contactId} not found`);
      }
      if (item.leadId) {
        const l = await this.prisma.lead.findFirst({
          where: { id: item.leadId, ownerId: userId },
        });
        if (!l) throw new BadRequestException(`Lead ${item.leadId} not found`);
      }
    }
  }

  private mapItem(item: {
    id: string;
    kind: string;
    status: string;
    position: number;
    visitId: string | null;
    taskId: string | null;
    contactId: string | null;
    leadId: string | null;
    title: string;
    subtitle: string | null;
    scheduledAt: Date | null;
    completedAt: Date | null;
    completedBy: string | null;
    metadata: unknown;
  }): AgendaPlanItem {
    return {
      id: item.id,
      kind: item.kind as AgendaPlanItem["kind"],
      status: item.status as AgendaPlanItem["status"],
      position: item.position,
      visitId: item.visitId,
      taskId: item.taskId,
      contactId: item.contactId,
      leadId: item.leadId,
      title: item.title,
      subtitle: item.subtitle,
      scheduledAt: item.scheduledAt?.toISOString() ?? null,
      completedAt: item.completedAt?.toISOString() ?? null,
      completedBy: item.completedBy,
      metadata: (item.metadata ?? undefined) as AgendaPlanItem["metadata"],
    };
  }

  private dbItemToInput(item: {
    kind: string;
    status: string;
    position: number;
    visitId: string | null;
    taskId: string | null;
    contactId: string | null;
    leadId: string | null;
    title: string;
    subtitle: string | null;
    scheduledAt: Date | null;
    metadata: unknown;
  }): AgendaPlanItemInput {
    return {
      kind: item.kind as AgendaPlanItemInput["kind"],
      status: item.status as AgendaPlanItemInput["status"],
      position: item.position,
      visitId: item.visitId,
      taskId: item.taskId,
      contactId: item.contactId,
      leadId: item.leadId,
      title: item.title,
      subtitle: item.subtitle,
      scheduledAt: item.scheduledAt?.toISOString() ?? null,
      metadata: (item.metadata ?? undefined) as AgendaPlanItemInput["metadata"],
    };
  }

  private async resolveProfile(userId: string): Promise<DailyAgendaProfile> {
    const row = await this.prisma.userFieldProfile.findUnique({ where: { userId } });
    return row ? "field" : "office";
  }

  private parseDate(dateRaw: string | undefined): string {
    const trimmed = dateRaw?.trim();
    if (trimmed && !DATE_YMD.test(trimmed)) {
      throw new BadRequestException("Invalid date; use YYYY-MM-DD");
    }
    return trimmed && DATE_YMD.test(trimmed) ? trimmed : todayYmdKyiv();
  }

  private assertSelfOnly(actor: AuthUser, targetUserId: string): void {
    if (actor.role === UserRole.ADMIN || actor.role === UserRole.LEAD) {
      if (targetUserId === actor.id) return;
      throw new ForbiddenException("Daily agenda is only available for your own plan in v1");
    }
    if (actor.role === UserRole.MANAGER) {
      if (targetUserId === actor.id) return;
      throw new ForbiddenException("You can only manage your own daily agenda");
    }
    throw new ForbiddenException("Access denied");
  }
}
