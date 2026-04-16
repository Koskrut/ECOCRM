import { Injectable } from "@nestjs/common";
import { TaskStatus, UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import type {
  ContactExclusionCode,
  ContactScoringSignal,
} from "./types/contacts-priority.types";

type ContactSummaryRow = {
  id: string;
  ownerId: string | null;
  companyId: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  status: string | null;
  marketingCallOptOut: boolean;
  createdAt: Date;
  company: { name: string } | null;
  owner: { fullName: string } | null;
};

@Injectable()
export class ContactsInsightsService {
  constructor(private readonly prisma: PrismaService) {}

  async getContactOrThrow(contactId: string): Promise<ContactSummaryRow | null> {
    const row = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: {
        id: true,
        ownerId: true,
        companyId: true,
        firstName: true,
        lastName: true,
        phone: true,
        status: true,
        marketingCallOptOut: true,
        createdAt: true,
        company: { select: { name: true } },
        owner: { select: { fullName: true } },
      },
    });
    return row;
  }

  canAccessContact(contact: { ownerId: string | null }, actor?: AuthUser): boolean {
    if (!actor) return true;
    if (actor.role !== UserRole.MANAGER) return true;
    return contact.ownerId === actor.id || contact.ownerId == null;
  }

  buildExclusionSet(contact: {
    status: string | null;
    marketingCallOptOut: boolean;
  }): ContactExclusionCode[] {
    const exclusions: ContactExclusionCode[] = [];
    if (contact.marketingCallOptOut) {
      exclusions.push("DO_NOT_DISTURB");
    }
    const status = (contact.status ?? "").trim().toLowerCase();
    const nonTarget = new Set([
      "відмова",
      "не працює з імплантами",
      "видалити",
    ]);
    if (status && nonTarget.has(status)) {
      exclusions.push("NON_TARGET_STATUS");
    }
    return exclusions;
  }

  async buildSignalsForContacts(
    contacts: Array<{
      id: string;
      createdAt: Date;
    }>,
    actor?: AuthUser,
  ): Promise<Map<string, ContactScoringSignal>> {
    const ids = contacts.map((c) => c.id);
    if (ids.length === 0) return new Map();
    const now = new Date();
    const d30 = new Date(now);
    d30.setDate(d30.getDate() - 30);
    const d90 = new Date(now);
    d90.setDate(d90.getDate() - 90);
    const d365 = new Date(now);
    d365.setDate(d365.getDate() - 365);

    const taskWhereBase: {
      contactId: { in: string[] };
      status: { in: TaskStatus[] };
      assigneeId?: string;
    } = {
      contactId: { in: ids },
      status: { in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS] },
    };
    if (actor?.role === UserRole.MANAGER) {
      taskWhereBase.assigneeId = actor.id;
    }

    const orderWhereBase: {
      clientId: { in: string[] };
      ownerId?: string;
    } = {
      clientId: { in: ids },
    };
    if (actor?.role === UserRole.MANAGER) {
      orderWhereBase.ownerId = actor.id;
    }

    const [taskOpenRows, taskOverdueRows, ordersAll, orders30, orders90, orders365, activities, calls] =
      await Promise.all([
        this.prisma.task.groupBy({
          by: ["contactId"],
          where: taskWhereBase,
          _count: { _all: true },
        }),
        this.prisma.task.groupBy({
          by: ["contactId"],
          where: {
            ...taskWhereBase,
            dueAt: { lt: now },
          },
          _count: { _all: true },
        }),
        this.prisma.order.findMany({
          where: orderWhereBase,
          select: {
            clientId: true,
            createdAt: true,
            totalAmount: true,
            returnAdjustmentAmount: true,
            debtAmount: true,
          },
        }),
        this.prisma.order.findMany({
          where: { ...orderWhereBase, createdAt: { gte: d30 } },
          select: {
            clientId: true,
            totalAmount: true,
            returnAdjustmentAmount: true,
          },
        }),
        this.prisma.order.findMany({
          where: { ...orderWhereBase, createdAt: { gte: d90 } },
          select: {
            clientId: true,
            totalAmount: true,
            returnAdjustmentAmount: true,
          },
        }),
        this.prisma.order.findMany({
          where: { ...orderWhereBase, createdAt: { gte: d365 } },
          select: {
            clientId: true,
            totalAmount: true,
            returnAdjustmentAmount: true,
          },
        }),
        this.prisma.activity.findMany({
          where: {
            contactId: { in: ids },
            type: { in: ["CALL", "MEETING", "MANUAL_CALL"] },
          },
          select: { contactId: true, occurredAt: true, createdAt: true },
          orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        }),
        this.prisma.call.findMany({
          where: {
            contactId: { in: ids },
          },
          select: { contactId: true, startedAt: true },
          orderBy: { startedAt: "desc" },
        }),
      ]);

    const openTasksById = new Map<string, number>();
    const overdueTasksById = new Map<string, number>();
    for (const r of taskOpenRows) {
      if (!r.contactId) continue;
      openTasksById.set(r.contactId, r._count._all);
    }
    for (const r of taskOverdueRows) {
      if (!r.contactId) continue;
      overdueTasksById.set(r.contactId, r._count._all);
    }

    const lastOrderAtById = new Map<string, Date | null>();
    const debtById = new Map<string, number>();
    const ordersCountAllById = new Map<string, number>();
    for (const o of ordersAll) {
      const id = o.clientId ?? null;
      if (!id) continue;
      ordersCountAllById.set(id, (ordersCountAllById.get(id) ?? 0) + 1);
      debtById.set(id, (debtById.get(id) ?? 0) + Math.max(0, Number(o.debtAmount ?? 0)));
      const prev = lastOrderAtById.get(id) ?? null;
      if (!prev || o.createdAt > prev) {
        lastOrderAtById.set(id, o.createdAt);
      }
    }

    const revenue30ById = new Map<string, number>();
    const revenue90ById = new Map<string, number>();
    const revenue365ById = new Map<string, number>();
    const count30ById = new Map<string, number>();
    const count90ById = new Map<string, number>();
    const count365ById = new Map<string, number>();
    const addRevenue = (
      rows: Array<{
        clientId: string | null;
        totalAmount: number;
        returnAdjustmentAmount: number;
      }>,
      revMap: Map<string, number>,
      countMap: Map<string, number>,
    ) => {
      for (const o of rows) {
        const id = o.clientId ?? null;
        if (!id) continue;
        const revenue = Math.max(
          0,
          Number(o.totalAmount ?? 0) - Number(o.returnAdjustmentAmount ?? 0),
        );
        revMap.set(id, (revMap.get(id) ?? 0) + revenue);
        countMap.set(id, (countMap.get(id) ?? 0) + 1);
      }
    };
    addRevenue(orders30, revenue30ById, count30ById);
    addRevenue(orders90, revenue90ById, count90ById);
    addRevenue(orders365, revenue365ById, count365ById);

    const lastActivityContactAtById = new Map<string, Date | null>();
    for (const a of activities) {
      const id = a.contactId ?? null;
      if (!id || lastActivityContactAtById.has(id)) continue;
      lastActivityContactAtById.set(id, a.occurredAt ?? a.createdAt ?? null);
    }
    const lastCallAtById = new Map<string, Date | null>();
    for (const c of calls) {
      const id = c.contactId ?? null;
      if (!id || lastCallAtById.has(id)) continue;
      lastCallAtById.set(id, c.startedAt ?? null);
    }

    const out = new Map<string, ContactScoringSignal>();
    for (const c of contacts) {
      const lastA = lastActivityContactAtById.get(c.id) ?? null;
      const lastC = lastCallAtById.get(c.id) ?? null;
      const lastContactAt =
        lastA && lastC ? (lastA > lastC ? lastA : lastC) : (lastA ?? lastC ?? null);
      const lastOrderAt = lastOrderAtById.get(c.id) ?? null;
      const daysSinceCreated = Math.max(
        0,
        Math.floor((now.getTime() - c.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
      );
      const daysSinceLastContact =
        lastContactAt != null
          ? Math.max(
              0,
              Math.floor(
                (now.getTime() - new Date(lastContactAt).getTime()) / (1000 * 60 * 60 * 24),
              ),
            )
          : null;
      const daysSinceLastOrder =
        lastOrderAt != null
          ? Math.max(
              0,
              Math.floor(
                (now.getTime() - new Date(lastOrderAt).getTime()) / (1000 * 60 * 60 * 24),
              ),
            )
          : null;
      const ordersCount365 = count365ById.get(c.id) ?? 0;
      const hasOrderHistory = (ordersCountAllById.get(c.id) ?? 0) > 0;
      const revenue90 = revenue90ById.get(c.id) ?? 0;
      const revenue365 = revenue365ById.get(c.id) ?? 0;

      const isAtRisk =
        hasOrderHistory &&
        ((daysSinceLastOrder != null && daysSinceLastOrder >= 45) ||
          (daysSinceLastContact != null && daysSinceLastContact >= 30));
      const isDormant =
        hasOrderHistory && daysSinceLastOrder != null && daysSinceLastOrder >= 90;
      const isNewLeadNoFirstContact = daysSinceCreated <= 7 && lastContactAt == null;

      out.set(c.id, {
        contactId: c.id,
        daysSinceCreated,
        lastContactAt,
        lastOrderAt,
        daysSinceLastContact,
        daysSinceLastOrder,
        hasOrderHistory,
        overdueFollowupTasks: overdueTasksById.get(c.id) ?? 0,
        openTasksCount: openTasksById.get(c.id) ?? 0,
        debtAmount: debtById.get(c.id) ?? 0,
        revenue30: revenue30ById.get(c.id) ?? 0,
        revenue90,
        revenue365,
        ordersCount30: count30ById.get(c.id) ?? 0,
        ordersCount90: count90ById.get(c.id) ?? 0,
        ordersCount365,
        avgCheck90: (count90ById.get(c.id) ?? 0) > 0 ? revenue90 / (count90ById.get(c.id) ?? 1) : 0,
        avgCheck365:
          ordersCount365 > 0 ? revenue365 / ordersCount365 : 0,
        isNewLeadNoFirstContact,
        isDormant,
        isAtRisk,
      });
    }
    return out;
  }
}
