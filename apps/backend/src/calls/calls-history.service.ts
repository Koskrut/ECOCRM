import { ForbiddenException, Injectable } from "@nestjs/common";
import {
  ManualCallOutcome,
  ManualCallSessionStatus,
  Prisma,
  UserRole,
} from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import type { ListCallsHistoryQueryDto } from "./dto/list-calls-history-query.dto";

export type CallsHistoryItem = {
  rowKind: "CALL" | "MANUAL_ORPHAN";
  id: string;
  sortAt: string;
  provider: string | null;
  direction: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
  talkSec: number | null;
  waitingSec: number | null;
  status: string | null;
  recordingUrl: string | null;
  recordingStatus: string | null;
  fromDisplay: string | null;
  toDisplay: string | null;
  manager: { id: string; fullName: string | null } | null;
  target: {
    kind: "LEAD" | "CONTACT";
    id: string;
    displayName: string;
    phone: string | null;
    companyName: string | null;
  } | null;
  manualOutcome: ManualCallOutcome | null;
  manualNote: string | null;
  manualCompletedAt: string | null;
  manualUser: { id: string; fullName: string | null } | null;
};

@Injectable()
export class CallsHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listHistory(dto: ListCallsHistoryQueryDto, actor: AuthUser) {
    const page = Math.max(1, dto.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, dto.pageSize ?? 25));
    const skip = (page - 1) * pageSize;

    const fromDate = dto.from?.trim() ? new Date(dto.from) : null;
    const toDate = dto.to?.trim() ? new Date(dto.to) : null;

    let leadAllowedManagerIds: string[] | null = null;
    if (actor.role === UserRole.LEAD) {
      const team = await this.prisma.user.findMany({
        where: { leadId: actor.id },
        select: { id: true },
      });
      leadAllowedManagerIds = [actor.id, ...team.map((t) => t.id)];
      if (dto.userId?.trim()) {
        const pick = dto.userId.trim();
        if (!leadAllowedManagerIds.includes(pick)) {
          throw new ForbiddenException("Немає доступу до цього менеджера");
        }
      }
    }

    const callConditions: Prisma.Sql[] = [];
    if (fromDate && !Number.isNaN(fromDate.getTime())) {
      callConditions.push(Prisma.sql`c."startedAt" >= ${fromDate}`);
    }
    if (toDate && !Number.isNaN(toDate.getTime())) {
      callConditions.push(Prisma.sql`c."startedAt" <= ${toDate}`);
    }

    if (actor.role === UserRole.MANAGER) {
      callConditions.push(Prisma.sql`(
        c."managerUserId" = ${actor.id}
        OR EXISTS (SELECT 1 FROM "Lead" l WHERE l."id" = c."leadId" AND l."ownerId" = ${actor.id})
        OR EXISTS (SELECT 1 FROM "Contact" ct WHERE ct."id" = c."contactId" AND ct."ownerId" = ${actor.id})
      )`);
    } else if (leadAllowedManagerIds && leadAllowedManagerIds.length > 0) {
      const idParams = Prisma.join(leadAllowedManagerIds.map((id) => Prisma.sql`${id}`));
      if (dto.userId?.trim()) {
        const uid = dto.userId.trim();
        callConditions.push(Prisma.sql`(
          c."managerUserId" = ${uid}
          OR EXISTS (SELECT 1 FROM "Lead" l WHERE l."id" = c."leadId" AND l."ownerId" = ${uid})
          OR EXISTS (SELECT 1 FROM "Contact" ct WHERE ct."id" = c."contactId" AND ct."ownerId" = ${uid})
        )`);
      } else {
        callConditions.push(Prisma.sql`(
          c."managerUserId" IN (${idParams})
          OR EXISTS (SELECT 1 FROM "Lead" l WHERE l."id" = c."leadId" AND l."ownerId" IN (${idParams}))
          OR EXISTS (SELECT 1 FROM "Contact" ct WHERE ct."id" = c."contactId" AND ct."ownerId" IN (${idParams}))
        )`);
      }
    } else if (dto.userId?.trim()) {
      const uid = dto.userId.trim();
      callConditions.push(Prisma.sql`c."managerUserId" = ${uid}`);
    }

    if (dto.direction) {
      callConditions.push(Prisma.sql`c."direction" = ${dto.direction}`);
    }
    if (dto.provider?.trim()) {
      callConditions.push(Prisma.sql`c."provider" = ${dto.provider.trim()}`);
    }

    const recording = dto.recording ?? "any";
    if (recording === "yes") {
      callConditions.push(Prisma.sql`c."recordingUrl" IS NOT NULL`);
    } else if (recording === "no") {
      callConditions.push(Prisma.sql`(c."recordingUrl" IS NULL OR c."recordingUrl" = '')`);
    }

    if (dto.outcome) {
      callConditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "ManualCallSession" ms
        WHERE ms."callId" = c."id" AND ms."status" = 'COMPLETED'::"ManualCallSessionStatus"
        AND ms."outcome" = ${dto.outcome}::"ManualCallOutcome"
      )`);
    }
    if (dto.manualOnly) {
      callConditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "ManualCallSession" ms
        WHERE ms."callId" = c."id" AND ms."status" = 'COMPLETED'::"ManualCallSessionStatus"
        AND ms."outcome" IS NOT NULL
      )`);
    }

    if (dto.q?.trim()) {
      this.pushSearchOnCall(callConditions, dto.q.trim());
    }

    const callPredicate =
      callConditions.length > 0 ? Prisma.join(callConditions, " AND ") : Prisma.sql`TRUE`;

    const manualConditions: Prisma.Sql[] = [
      Prisma.sql`m."status" = 'COMPLETED'::"ManualCallSessionStatus"`,
      Prisma.sql`m."callId" IS NULL`,
    ];
    if (fromDate && !Number.isNaN(fromDate.getTime())) {
      manualConditions.push(Prisma.sql`m."completedAt" >= ${fromDate}`);
    }
    if (toDate && !Number.isNaN(toDate.getTime())) {
      manualConditions.push(Prisma.sql`m."completedAt" <= ${toDate}`);
    }

    if (actor.role === UserRole.MANAGER) {
      manualConditions.push(Prisma.sql`m."userId" = ${actor.id}`);
    } else if (leadAllowedManagerIds && leadAllowedManagerIds.length > 0) {
      if (dto.userId?.trim()) {
        const uid = dto.userId.trim();
        manualConditions.push(Prisma.sql`m."userId" = ${uid}`);
      } else {
        const idParams = Prisma.join(leadAllowedManagerIds.map((id) => Prisma.sql`${id}`));
        manualConditions.push(Prisma.sql`m."userId" IN (${idParams})`);
      }
    } else if (dto.userId?.trim()) {
      manualConditions.push(Prisma.sql`m."userId" = ${dto.userId.trim()}`);
    }

    if (dto.outcome) {
      manualConditions.push(Prisma.sql`m."outcome" = ${dto.outcome}::"ManualCallOutcome"`);
    }
    if (dto.manualOnly) {
      manualConditions.push(Prisma.sql`m."outcome" IS NOT NULL`);
    }

    if (recording === "yes") {
      manualConditions.push(Prisma.sql`FALSE`);
    }
    if (dto.direction === "INBOUND" || dto.direction === "UNKNOWN") {
      manualConditions.push(Prisma.sql`FALSE`);
    }
    if (dto.provider?.trim()) {
      manualConditions.push(Prisma.sql`FALSE`);
    }

    if (dto.q?.trim()) {
      this.pushSearchOnManual(manualConditions, dto.q.trim());
    }

    const manualWhere = Prisma.join(manualConditions, " AND ");

    const union = Prisma.sql`
      SELECT u.xid, u.xk, u.xts FROM (
        SELECT c."id" AS xid, 'C'::text AS xk, c."startedAt" AS xts
        FROM "Call" c
        WHERE ${callPredicate}
        UNION ALL
        SELECT m."id", 'M'::text, m."completedAt"
        FROM "ManualCallSession" m
        WHERE ${manualWhere}
      ) u
      ORDER BY u.xts DESC
      LIMIT ${pageSize} OFFSET ${skip}
    `;

    const countSql = Prisma.sql`
      SELECT COUNT(*)::int AS cnt FROM (
        SELECT c."id" FROM "Call" c WHERE ${callPredicate}
        UNION ALL
        SELECT m."id" FROM "ManualCallSession" m WHERE ${manualWhere}
      ) t
    `;

    const [idRows, countRows] = await Promise.all([
      this.prisma.$queryRaw<{ xid: string; xk: string; xts: Date }[]>(union),
      this.prisma.$queryRaw<{ cnt: number }[]>(countSql),
    ]);

    const total = countRows[0]?.cnt ?? 0;

    const callIds = idRows.filter((r) => r.xk === "C").map((r) => r.xid);
    const manualIds = idRows.filter((r) => r.xk === "M").map((r) => r.xid);

    const [calls, manuals] = await Promise.all([
      callIds.length
        ? this.prisma.call.findMany({
            where: { id: { in: callIds } },
            include: {
              manualCallSessions: {
                where: { status: ManualCallSessionStatus.COMPLETED },
                orderBy: { completedAt: "desc" },
                take: 1,
                include: { user: { select: { id: true, fullName: true } } },
              },
            },
          })
        : [],
      manualIds.length
        ? this.prisma.manualCallSession.findMany({
            where: { id: { in: manualIds } },
            include: {
              lead: {
                select: {
                  id: true,
                  fullName: true,
                  firstName: true,
                  lastName: true,
                  phone: true,
                  company: { select: { name: true } },
                },
              },
              contact: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  phone: true,
                  company: { select: { name: true } },
                },
              },
              user: { select: { id: true, fullName: true } },
            },
          })
        : [],
    ]);

    const callMap = new Map(calls.map((c) => [c.id, c]));
    const manualMap = new Map(manuals.map((m) => [m.id, m]));

    const managerIds = new Set<string>();
    const leadIds = new Set<string>();
    const contactIds = new Set<string>();
    for (const c of calls) {
      if (c.managerUserId) managerIds.add(c.managerUserId);
      if (c.leadId) leadIds.add(c.leadId);
      if (c.contactId) contactIds.add(c.contactId);
    }

    const [managers, leads, contacts] = await Promise.all([
      managerIds.size > 0
        ? this.prisma.user.findMany({
            where: { id: { in: [...managerIds] } },
            select: { id: true, fullName: true },
          })
        : [],
      leadIds.size > 0
        ? this.prisma.lead.findMany({
            where: { id: { in: [...leadIds] } },
            select: {
              id: true,
              fullName: true,
              firstName: true,
              lastName: true,
              phone: true,
              company: { select: { name: true } },
            },
          })
        : [],
      contactIds.size > 0
        ? this.prisma.contact.findMany({
            where: { id: { in: [...contactIds] } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              company: { select: { name: true } },
            },
          })
        : [],
    ]);
    const managerById = new Map(managers.map((u) => [u.id, u]));
    const leadById = new Map(leads.map((l) => [l.id, l]));
    const contactById = new Map(contacts.map((c) => [c.id, c]));

    const items: CallsHistoryItem[] = idRows.map((r) => {
      if (r.xk === "C") {
        const c = callMap.get(r.xid);
        if (!c) {
          return this.fallbackItem(r.xts);
        }
        const lead = c.leadId ? leadById.get(c.leadId) ?? null : null;
        const contact = c.contactId ? contactById.get(c.contactId) ?? null : null;
        return this.mapCallRow(c, lead, contact, managerById);
      }
      const m = manualMap.get(r.xid);
      if (!m) {
        return this.fallbackItem(r.xts);
      }
      return this.mapManualOrphanRow(m);
    });

    return { items, total, page, pageSize };
  }

  private fallbackItem(ts: Date): CallsHistoryItem {
    return {
      rowKind: "CALL",
      id: "unknown",
      sortAt: ts.toISOString(),
      provider: null,
      direction: null,
      startedAt: null,
      endedAt: null,
      durationSec: null,
      talkSec: null,
      waitingSec: null,
      status: null,
      recordingUrl: null,
      recordingStatus: null,
      fromDisplay: null,
      toDisplay: null,
      manager: null,
      target: null,
      manualOutcome: null,
      manualNote: null,
      manualCompletedAt: null,
      manualUser: null,
    };
  }

  private pushSearchOnCall(parts: Prisma.Sql[], q: string) {
    const like = `%${q}%`;
    const digits = q.replace(/\D/g, "");
    const orParts: Prisma.Sql[] = [
      Prisma.sql`EXISTS (SELECT 1 FROM "Lead" l WHERE l."id" = c."leadId" AND (l."phone" ILIKE ${like} OR l."fullName" ILIKE ${like}))`,
      Prisma.sql`EXISTS (SELECT 1 FROM "Contact" ct WHERE ct."id" = c."contactId" AND (
        ct."phone" ILIKE ${like} OR ct."firstName" ILIKE ${like} OR ct."lastName" ILIKE ${like}
      ))`,
    ];
    if (digits.length > 0) {
      const d = `%${digits}%`;
      orParts.push(Prisma.sql`c."fromNormalized" LIKE ${d}`);
      orParts.push(Prisma.sql`c."toNormalized" LIKE ${d}`);
    }
    parts.push(Prisma.sql`(${Prisma.join(orParts, " OR ")})`);
  }

  private pushSearchOnManual(parts: Prisma.Sql[], q: string) {
    const like = `%${q}%`;
    const digits = q.replace(/\D/g, "");
    const orParts: Prisma.Sql[] = [
      Prisma.sql`EXISTS (SELECT 1 FROM "Lead" l WHERE l."id" = m."leadId" AND (l."phone" ILIKE ${like} OR l."fullName" ILIKE ${like}))`,
      Prisma.sql`EXISTS (SELECT 1 FROM "Contact" ct WHERE ct."id" = m."contactId" AND (
        ct."phone" ILIKE ${like} OR ct."firstName" ILIKE ${like} OR ct."lastName" ILIKE ${like}
      ))`,
    ];
    if (digits.length > 0) {
      const d = `%${digits}%`;
      orParts.push(Prisma.sql`m."targetPhoneNormalized" LIKE ${d}`);
    }
    parts.push(Prisma.sql`(${Prisma.join(orParts, " OR ")})`);
  }

  private mapCallRow(
    c: {
      id: string;
      provider: string;
      direction: string;
      from: string;
      to: string;
      startedAt: Date;
      endedAt: Date | null;
      durationSec: number | null;
      status: string;
      recordingUrl: string | null;
      recordingStatus: string | null;
      meta: unknown;
      managerUserId: string | null;
      manualCallSessions: {
        outcome: ManualCallOutcome | null;
        note: string | null;
        completedAt: Date | null;
        user: { id: string; fullName: string | null } | null;
      }[];
    },
    lead: {
      id: string;
      fullName: string | null;
      firstName: string | null;
      lastName: string | null;
      phone: string | null;
      company: { name: string } | null;
    } | null,
    contact: {
      id: string;
      firstName: string;
      lastName: string;
      phone: string;
      company: { name: string } | null;
    } | null,
    managerById: Map<string, { id: string; fullName: string | null }>,
  ): CallsHistoryItem {
    const ms = c.manualCallSessions[0];
    const mgr = c.managerUserId ? managerById.get(c.managerUserId) ?? null : null;
    const meta = (c.meta ?? null) as { talkSec?: unknown; waitingSec?: unknown } | null;
    const talkSec = meta && typeof meta.talkSec === "number" ? meta.talkSec : null;
    const waitingSec = meta && typeof meta.waitingSec === "number" ? meta.waitingSec : null;
    return {
      rowKind: "CALL",
      id: c.id,
      sortAt: c.startedAt.toISOString(),
      provider: c.provider,
      direction: c.direction,
      startedAt: c.startedAt.toISOString(),
      endedAt: c.endedAt?.toISOString() ?? null,
      durationSec: c.durationSec,
      talkSec,
      waitingSec,
      status: c.status,
      recordingUrl: c.recordingUrl,
      recordingStatus: c.recordingStatus,
      fromDisplay: c.from,
      toDisplay: c.to,
      manager: mgr ? { id: mgr.id, fullName: mgr.fullName } : null,
      target: this.mapTarget(lead, contact),
      manualOutcome: ms?.outcome ?? null,
      manualNote: ms?.note ?? null,
      manualCompletedAt: ms?.completedAt?.toISOString() ?? null,
      manualUser: ms?.user ? { id: ms.user.id, fullName: ms.user.fullName } : null,
    };
  }

  private mapManualOrphanRow(m: {
    id: string;
    outcome: ManualCallOutcome | null;
    note: string | null;
    completedAt: Date | null;
    targetPhoneNormalized: string | null;
    lead: {
      id: string;
      fullName: string | null;
      firstName: string | null;
      lastName: string | null;
      phone: string | null;
      company: { name: string } | null;
    } | null;
    contact: {
      id: string;
      firstName: string;
      lastName: string;
      phone: string;
      company: { name: string } | null;
    } | null;
    user: { id: string; fullName: string | null };
  }): CallsHistoryItem {
    const at = m.completedAt ?? new Date();
    return {
      rowKind: "MANUAL_ORPHAN",
      id: m.id,
      sortAt: at.toISOString(),
      provider: null,
      direction: "OUTBOUND",
      startedAt: null,
      endedAt: null,
      durationSec: null,
      talkSec: null,
      waitingSec: null,
      status: "MANUAL_CALL",
      recordingUrl: null,
      recordingStatus: null,
      fromDisplay: null,
      toDisplay: m.targetPhoneNormalized,
      manager: { id: m.user.id, fullName: m.user.fullName },
      target: this.mapTarget(m.lead, m.contact),
      manualOutcome: m.outcome,
      manualNote: m.note,
      manualCompletedAt: m.completedAt?.toISOString() ?? null,
      manualUser: { id: m.user.id, fullName: m.user.fullName },
    };
  }

  private mapTarget(
    lead: {
      id: string;
      fullName: string | null;
      firstName: string | null;
      lastName: string | null;
      phone: string | null;
      company: { name: string } | null;
    } | null,
    contact: {
      id: string;
      firstName: string;
      lastName: string;
      phone: string;
      company: { name: string } | null;
    } | null,
  ): CallsHistoryItem["target"] {
    if (lead) {
      return {
        kind: "LEAD",
        id: lead.id,
        displayName:
          lead.fullName?.trim() ||
          [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim() ||
          lead.phone ||
          "Lead",
        phone: lead.phone,
        companyName: lead.company?.name ?? null,
      };
    }
    if (contact) {
      return {
        kind: "CONTACT",
        id: contact.id,
        displayName: `${contact.firstName} ${contact.lastName}`.trim(),
        phone: contact.phone,
        companyName: contact.company?.name ?? null,
      };
    }
    return null;
  }
}
