import { Injectable, Optional } from "@nestjs/common";
import { Prisma, TaskStatus, UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { toBaseCurrency } from "../common/currency.util";
import {
  aggregateClientFinance,
  type ClientFinanceBalanceInput,
} from "../finance/client-finance";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService, type ExchangeRates } from "../settings/settings.service";
import {
  buildContactScoringSignal,
  contactStatusIsDuplicate,
  orderCountsAsPurchase,
} from "./contact-signals.util";
import type { ContactExclusionCode, ContactScoringSignal } from "./types/contacts-priority.types";

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

const FALLBACK_RATES: ExchangeRates = {
  UAH_TO_USD: 1,
  EUR_TO_USD: 1,
  baseCurrency: "USD",
};

@Injectable()
export class ContactsInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly settings?: SettingsService,
  ) {}

  private async exchangeRates(): Promise<ExchangeRates> {
    if (!this.settings) return { ...FALLBACK_RATES };
    return this.settings.getExchangeRates();
  }

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
    if (contactStatusIsDuplicate(status)) {
      exclusions.push("DUPLICATE_MARKED");
    }
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

    const orderWhere: {
      OR: Array<{ clientId?: { in: string[] }; contactId?: { in: string[] } }>;
    } = {
      OR: [{ clientId: { in: ids } }, { contactId: { in: ids } }],
    };

    const [taskOpenRows, taskOverdueRows, ordersAll, touchRows, balanceRows, rates] =
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
          where: orderWhere,
          select: {
            clientId: true,
            contactId: true,
            ownerId: true,
            createdAt: true,
            totalAmount: true,
            returnAdjustmentAmount: true,
            debtAmount: true,
            creditAmount: true,
            paidAmount: true,
            currency: true,
            paymentDueDate: true,
            orderStage: true,
            legacySource: true,
          },
        }),
        this.loadLatestTouches(ids),
        this.prisma.clientBalance.findMany({
          where: { holderKind: "CONTACT", holderId: { in: ids } },
          select: { holderId: true, amount: true, currency: true },
        }),
        this.exchangeRates(),
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

    const idSet = new Set(ids);
    const managerId = actor?.role === UserRole.MANAGER ? actor.id : null;
    const ordersByClient = new Map<string, typeof ordersAll>();
    const anyOrderAtById = new Map<string, Date>();
    const lastOrderAtById = new Map<string, Date>();
    const ordersCountAllById = new Map<string, number>();
    const revenue30ById = new Map<string, number>();
    const revenue90ById = new Map<string, number>();
    const revenue365ById = new Map<string, number>();
    const count30ById = new Map<string, number>();
    const count90ById = new Map<string, number>();
    const count365ById = new Map<string, number>();

    const rememberDate = (map: Map<string, Date>, id: string, at: Date) => {
      const prev = map.get(id) ?? null;
      if (!prev || at > prev) map.set(id, at);
    };

    for (const o of ordersAll) {
      const parties: string[] = [];
      if (o.clientId && idSet.has(o.clientId)) parties.push(o.clientId);
      if (o.contactId && idSet.has(o.contactId) && o.contactId !== o.clientId) {
        parties.push(o.contactId);
      }
      if (o.clientId && idSet.has(o.clientId) && (!managerId || o.ownerId === managerId)) {
        const grouped = ordersByClient.get(o.clientId) ?? [];
        grouped.push(o);
        ordersByClient.set(o.clientId, grouped);
      }
      for (const id of parties) {
        rememberDate(anyOrderAtById, id, o.createdAt);
        if (!orderCountsAsPurchase(o)) continue;
        ordersCountAllById.set(id, (ordersCountAllById.get(id) ?? 0) + 1);
        rememberDate(lastOrderAtById, id, o.createdAt);
        const addWindow = (since: Date, countMap: Map<string, number>) => {
          if (o.createdAt < since) return;
          countMap.set(id, (countMap.get(id) ?? 0) + 1);
        };
        addWindow(d30, count30ById);
        addWindow(d90, count90ById);
        addWindow(d365, count365ById);
        if (id !== o.clientId) continue;
        const net = Math.max(
          0,
          Number(o.totalAmount ?? 0) - Number(o.returnAdjustmentAmount ?? 0),
        );
        const base = Math.round(toBaseCurrency(net, o.currency, rates) * 100) / 100;
        const addRevenue = (since: Date, revMap: Map<string, number>) => {
          if (o.createdAt < since) return;
          revMap.set(id, Math.round(((revMap.get(id) ?? 0) + base) * 100) / 100);
        };
        addRevenue(d30, revenue30ById);
        addRevenue(d90, revenue90ById);
        addRevenue(d365, revenue365ById);
      }
    }

    const balancesByClient = new Map<string, ClientFinanceBalanceInput[]>();
    for (const row of balanceRows) {
      const list = balancesByClient.get(row.holderId) ?? [];
      list.push({ amount: row.amount, currency: row.currency });
      balancesByClient.set(row.holderId, list);
    }

    const touchAtById = new Map<string, Date>();
    for (const row of touchRows) {
      const at = row.at instanceof Date ? row.at : new Date(row.at);
      if (!row.contactId || Number.isNaN(at.getTime())) continue;
      touchAtById.set(row.contactId, at);
    }

    const out = new Map<string, ContactScoringSignal>();
    for (const c of contacts) {
      const finance = aggregateClientFinance(
        ordersByClient.get(c.id) ?? [],
        balancesByClient.get(c.id) ?? [],
        rates,
        now,
      );
      out.set(
        c.id,
        buildContactScoringSignal({
          contactId: c.id,
          createdAt: c.createdAt,
          now,
          lastActivityAt: touchAtById.get(c.id) ?? null,
          lastCallAt: null,
          lastMessageAt: null,
          lastOrderAt: lastOrderAtById.get(c.id) ?? null,
          anyOrderAt: anyOrderAtById.get(c.id) ?? null,
          ordersCountAll: ordersCountAllById.get(c.id) ?? 0,
          overdueFollowupTasks: overdueTasksById.get(c.id) ?? 0,
          openTasksCount: openTasksById.get(c.id) ?? 0,
          debtAmount: finance.netDebt,
          revenue30: revenue30ById.get(c.id) ?? 0,
          revenue90: revenue90ById.get(c.id) ?? 0,
          revenue365: revenue365ById.get(c.id) ?? 0,
          ordersCount30: count30ById.get(c.id) ?? 0,
          ordersCount90: count90ById.get(c.id) ?? 0,
          ordersCount365: count365ById.get(c.id) ?? 0,
        }),
      );
    }
    return out;
  }

  /**
   * One grouped read instead of every call, meeting, and message row.
   * Missed, busy, and failed calls are not a conversation.
   */
  private loadLatestTouches(ids: string[]): Promise<Array<{ contactId: string | null; at: Date }>> {
    const missed = Prisma.sql`
      status IS NOT NULL
      AND btrim(status) <> ''
      AND (
        status ILIKE '%miss%'
        OR replace(replace(replace(lower(status), ' ', ''), '_', ''), '-', '') LIKE '%noanswer%'
        OR replace(replace(replace(lower(status), ' ', ''), '_', ''), '-', '') LIKE '%notanswered%'
        OR status ILIKE '%busy%'
        OR status ILIKE '%fail%'
        OR status ILIKE '%cancel%'
      )
    `;
    return this.prisma.$queryRaw<Array<{ contactId: string | null; at: Date }>>(Prisma.sql`
      SELECT "contactId", MAX("at") AS "at"
      FROM (
        SELECT a."contactId", MAX(COALESCE(a."occurredAt", a."createdAt")) AS "at"
        FROM "Activity" a
        WHERE a."contactId" = ANY(${ids}::text[])
          AND a."type"::text IN ('CALL', 'MEETING', 'MANUAL_CALL')
          AND (
            a."callId" IS NULL
            OR NOT EXISTS (
              SELECT 1 FROM "Call" c
              WHERE c.id = a."callId" AND ${missed}
            )
          )
        GROUP BY a."contactId"
        UNION ALL
        SELECT c."contactId", MAX(c."startedAt") AS "at"
        FROM "Call" c
        WHERE c."contactId" = ANY(${ids}::text[])
          AND NOT (${missed})
        GROUP BY c."contactId"
        UNION ALL
        SELECT cv."contactId", MAX(cv."lastMessageAt") AS "at"
        FROM "Conversation" cv
        WHERE cv."contactId" = ANY(${ids}::text[])
          AND cv."lastMessageAt" IS NOT NULL
        GROUP BY cv."contactId"
        UNION ALL
        SELECT ta."contactId", MAX(ta."lastMessageAt") AS "at"
        FROM "TelegramAccount" ta
        WHERE ta."contactId" = ANY(${ids}::text[])
          AND ta."lastMessageAt" IS NOT NULL
        GROUP BY ta."contactId"
        UNION ALL
        SELECT mp."contactId", MAX(mp."lastMessageAt") AS "at"
        FROM "MetaParticipant" mp
        WHERE mp."contactId" = ANY(${ids}::text[])
          AND mp."lastMessageAt" IS NOT NULL
        GROUP BY mp."contactId"
      ) touches
      WHERE "contactId" IS NOT NULL
      GROUP BY "contactId"
    `);
  }
}
