import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { LeadEventType, TaskStatus, UserRole, VisitStatus } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { kyivDayBounds, todayYmdKyiv } from "../crm-timezone";
import { PrismaService } from "../prisma/prisma.service";
import { dayPlanStatusFromPercent, scoreDayPlanItem, scoreOverallPercent } from "./day-plan.scoring";
import {
  DEFAULT_FIELD_DAY_PLAN,
  DEFAULT_OFFICE_DAY_PLAN,
} from "./day-plan.templates";
import type {
  DayPlanItemResult,
  DayPlanPayload,
  DayPlanProfile,
  DayPlanTemplate,
  DayPlanTemplateItem,
  DayPlanUserMetrics,
} from "./day-plan.types";

const DATE_YMD = /^\d{4}-\d{2}-\d{2}$/;

function parseDateYmd(dateRaw: string | undefined): string {
  const trimmed = dateRaw?.trim();
  if (trimmed && !DATE_YMD.test(trimmed)) {
    throw new BadRequestException("Invalid date; use YYYY-MM-DD");
  }
  return trimmed && DATE_YMD.test(trimmed) ? trimmed : todayYmdKyiv();
}

function calendarDayBoundsKyiv(dateYmd: string): { from: Date; to: Date } {
  if (!DATE_YMD.test(dateYmd)) {
    throw new BadRequestException("Invalid date; use YYYY-MM-DD");
  }
  try {
    return kyivDayBounds(dateYmd);
  } catch {
    throw new BadRequestException("Invalid date");
  }
}

function routePlanUtcDate(dateYmd: string): Date {
  return new Date(`${dateYmd}T00:00:00.000Z`);
}

@Injectable()
export class DayPlanService {
  constructor(private readonly prisma: PrismaService) {}

  async getDayPlan(
    dateRaw: string | undefined,
    actor: AuthUser,
    requestedUserId?: string,
  ): Promise<DayPlanPayload> {
    const dateYmd = parseDateYmd(dateRaw);
    const targetUserId = requestedUserId?.trim() || actor.id;
    await this.assertCanViewUser(actor, targetUserId);

    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, fullName: true },
    });
    if (!user) {
      throw new BadRequestException("User not found");
    }

    const profile = await this.resolveProfile(targetUserId);
    const template = await this.resolveTemplate(profile);
    const metrics = await this.loadMetricsForUser(targetUserId, dateYmd);
    return this.buildPayload(dateYmd, user.id, user.fullName, profile, template, metrics);
  }

  async getOverallPercentsForUsers(
    userIds: string[],
    dateYmd: string,
  ): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();

    const profiles = await this.resolveProfiles(userIds);
    const metricsByUser = await this.loadMetricsForUsers(userIds, dateYmd);
    const result = new Map<string, number>();

    for (const userId of userIds) {
      const profile = profiles.get(userId) ?? "office";
      const template = profile === "field" ? DEFAULT_FIELD_DAY_PLAN : DEFAULT_OFFICE_DAY_PLAN;
      const metrics = metricsByUser.get(userId) ?? emptyMetrics();
      const payload = this.buildPayload(
        dateYmd,
        userId,
        "",
        profile,
        template,
        metrics,
      );
      result.set(userId, payload.overallPercent);
    }

    return result;
  }

  private async assertCanViewUser(actor: AuthUser, targetUserId: string): Promise<void> {
    if (actor.role === UserRole.ADMIN) return;
    if (actor.role === UserRole.LEAD) {
      if (targetUserId === actor.id) return;
      const member = await this.prisma.user.findFirst({
        where: { id: targetUserId, leadId: actor.id },
        select: { id: true },
      });
      if (member) return;
      throw new ForbiddenException("You can only view day plans for your team");
    }
    if (actor.role === UserRole.MANAGER) {
      if (targetUserId === actor.id) return;
      throw new ForbiddenException("You can only view your own day plan");
    }
    throw new ForbiddenException("Access denied");
  }

  private async resolveProfile(userId: string): Promise<DayPlanProfile> {
    const profiles = await this.resolveProfiles([userId]);
    return profiles.get(userId) ?? "office";
  }

  private async resolveProfiles(userIds: string[]): Promise<Map<string, DayPlanProfile>> {
    const rows = await this.prisma.userFieldProfile.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true },
    });
    const fieldIds = new Set(rows.map((r) => r.userId));
    const map = new Map<string, DayPlanProfile>();
    for (const id of userIds) {
      map.set(id, fieldIds.has(id) ? "field" : "office");
    }
    return map;
  }

  private async resolveTemplate(profile: DayPlanProfile): Promise<DayPlanTemplate> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: "day_plan_templates" },
      select: { value: true },
    });
    const saved = row?.value;
    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
      const key = profile === "field" ? "field" : "office";
      const custom = (saved as Record<string, unknown>)[key];
      if (custom && typeof custom === "object" && !Array.isArray(custom)) {
        const items = (custom as { items?: unknown }).items;
        if (Array.isArray(items) && items.length > 0) {
          const base = profile === "field" ? DEFAULT_FIELD_DAY_PLAN : DEFAULT_OFFICE_DAY_PLAN;
          return { profile, items: mergeTemplateItems(base.items, items) };
        }
      }
    }
    return profile === "field" ? DEFAULT_FIELD_DAY_PLAN : DEFAULT_OFFICE_DAY_PLAN;
  }

  private buildPayload(
    dateYmd: string,
    userId: string,
    fullName: string,
    profile: DayPlanProfile,
    template: DayPlanTemplate,
    metrics: DayPlanUserMetrics,
  ): DayPlanPayload {
    const items: DayPlanItemResult[] = template.items.map((item) =>
      this.buildItemResult(item, metrics),
    );
    const overallPercent = scoreOverallPercent(items);
    return {
      date: dateYmd,
      userId,
      fullName,
      profile,
      overallPercent,
      status: dayPlanStatusFromPercent(overallPercent),
      items,
    };
  }

  private buildItemResult(
    item: DayPlanTemplateItem,
    metrics: DayPlanUserMetrics,
  ): DayPlanItemResult {
    const { plan, fact } = this.resolvePlanAndFact(item, metrics);
    const scored = scoreDayPlanItem(item.kind, fact, plan);
    return {
      key: item.key,
      label: item.label,
      kind: item.kind,
      weight: item.weight,
      plan: scored.plan,
      fact: scored.fact,
      percent: scored.percent,
      actionHref: item.actionHref,
    };
  }

  private resolvePlanAndFact(
    item: DayPlanTemplateItem,
    m: DayPlanUserMetrics,
  ): { plan: number; fact: number } {
    switch (item.key) {
      case "calls_outbound":
        return { plan: item.target, fact: m.callsOutbound };
      case "orders_created":
        return { plan: item.target, fact: m.ordersCreated };
      case "work_queue_touches":
        return { plan: item.target, fact: m.workQueueTouches };
      case "visits_total_done":
        return { plan: item.target, fact: m.visitsDone };
      case "field_shift_started":
        return { plan: item.target, fact: m.fieldShiftStarted ? 1 : 0 };
      case "visits_from_plan_done":
        return {
          plan: m.visitsFromPlanTotal > 0 ? m.visitsFromPlanTotal : 0,
          fact: m.visitsFromPlanDone,
        };
      case "leads_new_processed": {
        const plan = m.leadsNewRemaining + m.leadsProcessedToday;
        return { plan, fact: m.leadsProcessedToday };
      }
      case "tasks_due_today_done": {
        const plan = m.tasksDueTodayTotal;
        return { plan, fact: m.tasksDueTodayDone };
      }
      case "overdue_tasks_zero":
        return { plan: 0, fact: m.overdueTasks };
      default:
        return { plan: item.target, fact: 0 };
    }
  }

  private async loadMetricsForUser(userId: string, dateYmd: string): Promise<DayPlanUserMetrics> {
    const map = await this.loadMetricsForUsers([userId], dateYmd);
    return map.get(userId) ?? emptyMetrics();
  }

  private async loadMetricsForUsers(
    userIds: string[],
    dateYmd: string,
  ): Promise<Map<string, DayPlanUserMetrics>> {
    const { from, to } = calendarDayBoundsKyiv(dateYmd);
    const routeDate = routePlanUtcDate(dateYmd);
    const now = new Date();

    const result = new Map<string, DayPlanUserMetrics>();
    for (const id of userIds) {
      result.set(id, emptyMetrics());
    }

    const [
      callOutboundGroups,
      orderGroups,
      visitGroups,
      tasksDueToday,
      overdueGroups,
      leadsNewGroups,
      leadEvents,
      touchCalls,
      routePlans,
      fieldShifts,
    ] = await Promise.all([
      this.prisma.call.groupBy({
        by: ["managerUserId"],
        where: {
          managerUserId: { in: userIds },
          startedAt: { gte: from, lte: to },
          direction: { equals: "OUTBOUND", mode: "insensitive" },
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
      this.prisma.visit.groupBy({
        by: ["ownerId"],
        where: {
          ownerId: { in: userIds },
          startsAt: { gte: from, lte: to },
          status: VisitStatus.DONE,
        },
        _count: { id: true },
      }),
      this.prisma.task.findMany({
        where: {
          assigneeId: { in: userIds },
          dueAt: { gte: from, lte: to },
        },
        select: { assigneeId: true, status: true },
      }),
      this.prisma.task.groupBy({
        by: ["assigneeId"],
        where: {
          assigneeId: { in: userIds },
          status: { in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS] },
          dueAt: { lt: now },
        },
        _count: { id: true },
      }),
      this.prisma.lead.groupBy({
        by: ["ownerId"],
        where: {
          ownerId: { in: userIds },
          status: "NEW",
        },
        _count: { id: true },
      }),
      this.prisma.leadEvent.findMany({
        where: {
          type: LeadEventType.STATUS_CHANGED,
          createdAt: { gte: from, lte: to },
          lead: { ownerId: { in: userIds } },
        },
        select: { lead: { select: { ownerId: true } } },
      }),
      this.prisma.call.findMany({
        where: {
          managerUserId: { in: userIds },
          startedAt: { gte: from, lte: to },
          direction: { equals: "OUTBOUND", mode: "insensitive" },
          contactId: { not: null },
        },
        select: { managerUserId: true, contactId: true },
      }),
      this.prisma.routePlan.findMany({
        where: {
          ownerId: { in: userIds },
          date: routeDate,
        },
        select: {
          ownerId: true,
          stops: {
            select: {
              visit: { select: { status: true } },
            },
          },
        },
      }),
      this.prisma.fieldShift.findMany({
        where: {
          ownerId: { in: userIds },
          date: routeDate,
        },
        select: { ownerId: true },
      }),
    ]);

    for (const g of callOutboundGroups) {
      const uid = g.managerUserId;
      if (!uid) continue;
      const row = result.get(uid);
      if (row) row.callsOutbound = g._count.id;
    }

    for (const g of orderGroups) {
      const row = result.get(g.ownerId);
      if (row) row.ordersCreated = g._count.id;
    }

    for (const g of visitGroups) {
      const row = result.get(g.ownerId);
      if (row) row.visitsDone = g._count.id;
    }

    for (const t of tasksDueToday) {
      const row = result.get(t.assigneeId);
      if (!row) continue;
      row.tasksDueTodayTotal += 1;
      if (t.status === TaskStatus.DONE) row.tasksDueTodayDone += 1;
    }

    for (const g of overdueGroups) {
      const row = result.get(g.assigneeId);
      if (row) row.overdueTasks = g._count.id;
    }

    for (const g of leadsNewGroups) {
      const uid = g.ownerId;
      if (!uid) continue;
      const row = result.get(uid);
      if (row) row.leadsNewRemaining = g._count.id;
    }

    for (const ev of leadEvents) {
      const uid = ev.lead.ownerId;
      if (!uid) continue;
      const row = result.get(uid);
      if (row) row.leadsProcessedToday += 1;
    }

    const touchesByUser = new Map<string, Set<string>>();
    for (const c of touchCalls) {
      const uid = c.managerUserId;
      const cid = c.contactId;
      if (!uid || !cid) continue;
      let set = touchesByUser.get(uid);
      if (!set) {
        set = new Set();
        touchesByUser.set(uid, set);
      }
      set.add(cid);
    }
    for (const [uid, set] of touchesByUser) {
      const row = result.get(uid);
      if (row) row.workQueueTouches = set.size;
    }

    for (const plan of routePlans) {
      const row = result.get(plan.ownerId);
      if (!row) continue;
      const total = plan.stops.length;
      const done = plan.stops.filter((s) => s.visit.status === VisitStatus.DONE).length;
      row.visitsFromPlanTotal = total;
      row.visitsFromPlanDone = done;
    }

    for (const shift of fieldShifts) {
      const row = result.get(shift.ownerId);
      if (row) row.fieldShiftStarted = true;
    }

    return result;
  }
}

function emptyMetrics(): DayPlanUserMetrics {
  return {
    callsOutbound: 0,
    ordersCreated: 0,
    visitsDone: 0,
    visitsFromPlanDone: 0,
    visitsFromPlanTotal: 0,
    fieldShiftStarted: false,
    tasksDueTodayTotal: 0,
    tasksDueTodayDone: 0,
    overdueTasks: 0,
    leadsNewRemaining: 0,
    leadsProcessedToday: 0,
    workQueueTouches: 0,
  };
}

function mergeTemplateItems(
  defaults: DayPlanTemplateItem[],
  overrides: unknown[],
): DayPlanTemplateItem[] {
  const byKey = new Map(defaults.map((d) => [d.key, { ...d }]));
  for (const raw of overrides) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Partial<DayPlanTemplateItem>;
    if (typeof o.key !== "string" || !byKey.has(o.key as DayPlanTemplateItem["key"])) continue;
    const base = byKey.get(o.key as DayPlanTemplateItem["key"])!;
    byKey.set(o.key as DayPlanTemplateItem["key"], {
      ...base,
      ...(typeof o.label === "string" ? { label: o.label } : {}),
      ...(typeof o.target === "number" ? { target: o.target } : {}),
      ...(typeof o.weight === "number" ? { weight: o.weight } : {}),
      ...(typeof o.actionHref === "string" ? { actionHref: o.actionHref } : {}),
    });
  }
  return Array.from(byKey.values());
}
