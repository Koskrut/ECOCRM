import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { ContactsInsightsService } from "./contacts-insights.service";
import { ContactsPriorityService } from "./contacts-priority.service";
import type { ContactWorkQueuePreset, GetWorkQueueDto } from "./dto/get-work-queue.dto";
import type { GetWorkQueueSummaryDto } from "./dto/get-work-queue-summary.dto";
import type { ContactPriorityReasonCode } from "./types/contacts-priority.types";

type QueueItem = {
  contact: {
    id: string;
    fullName: string;
    phone: string | null;
    ownerId: string | null;
    ownerName: string | null;
    companyName: string | null;
    status: string | null;
    clientStage: string | null;
    nextActionType: string | null;
    nextActionAt: string | null;
    marketingCallOptOut: boolean;
  };
  priorityScore: number;
  priorityReasons: string[];
  scoreBreakdown: Array<{
    code: string;
    weight: number;
    value: number;
    explanation: string;
  }>;
  metrics: {
    daysSinceCreated: number;
    daysSinceLastContact: number | null;
    daysSinceLastOrder: number | null;
    overdueFollowupTasks: number;
    debtAmount: number;
    lastContactAt: string | null;
    lastOrderAt: string | null;
  };
  suggestion: {
    suggestedStage: string | null;
    suggestedNextActionType: string;
  };
};

@Injectable()
export class ContactsWorkQueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly insights: ContactsInsightsService,
    private readonly priority: ContactsPriorityService,
  ) {}

  async getInsights(contactId: string, actor?: AuthUser) {
    const contact = await this.insights.getContactOrThrow(contactId);
    if (!contact) throw new NotFoundException("Contact not found");
    if (!this.insights.canAccessContact(contact, actor)) {
      throw new ForbiddenException("You can only access contacts assigned to you");
    }

    const exclusions = this.insights.buildExclusionSet(contact);
    const byId = await this.insights.buildSignalsForContacts(
      [{ id: contact.id, createdAt: contact.createdAt }],
      actor,
    );
    const signal = byId.get(contact.id);
    if (!signal) throw new NotFoundException("Signals not found");
    const pr = this.priority.score(signal);
    const suggestion = this.priority.suggest(signal, pr);

    return {
      contactId: contact.id,
      computedAt: new Date().toISOString(),
      exclusions: {
        excluded: exclusions.length > 0,
        reasons: exclusions,
      },
      metrics: {
        ...signal,
        lastContactAt: signal.lastContactAt?.toISOString() ?? null,
        lastOrderAt: signal.lastOrderAt?.toISOString() ?? null,
      },
      priority: {
        score: pr.score,
        reasons: pr.reasons,
        breakdown: pr.breakdown,
      },
      suggestion,
    };
  }

  async getWorkQueue(query: GetWorkQueueDto, actor?: AuthUser) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 25)));
    const skip = (page - 1) * pageSize;

    const where = this.buildWhere(query, actor);
    const rows = await this.prisma.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        ownerId: true,
        status: true,
        clientStage: true,
        nextActionType: true,
        nextActionAt: true,
        marketingCallOptOut: true,
        createdAt: true,
        owner: { select: { fullName: true } },
        company: { select: { name: true } },
      },
    });

    const signalsById = await this.insights.buildSignalsForContacts(
      rows.map((r) => ({ id: r.id, createdAt: r.createdAt })),
      actor,
    );

    const items: QueueItem[] = [];
    for (const row of rows) {
      const exclusions = this.insights.buildExclusionSet(row);
      if (exclusions.length > 0 && query.includeExcluded !== true) continue;
      const signal = signalsById.get(row.id);
      if (!signal) continue;
      const pr = this.priority.score(signal);
      const suggestion = this.priority.suggest(signal, pr);

      if (!this.matchesPreset(pr.reasons, query.preset)) continue;
      if (!this.matchesLegacyReasonFilters(pr.reasons, query)) continue;

      items.push({
        contact: {
          id: row.id,
          fullName: `${row.firstName} ${row.lastName}`.trim(),
          phone: row.phone,
          ownerId: row.ownerId,
          ownerName: row.owner?.fullName ?? null,
          companyName: row.company?.name ?? null,
          status: row.status,
          clientStage: row.clientStage ?? null,
          nextActionType: row.nextActionType ?? null,
          nextActionAt: row.nextActionAt?.toISOString() ?? null,
          marketingCallOptOut: row.marketingCallOptOut,
        },
        priorityScore: pr.score,
        priorityReasons: pr.reasons,
        scoreBreakdown: pr.breakdown,
        metrics: {
          daysSinceCreated: signal.daysSinceCreated,
          daysSinceLastContact: signal.daysSinceLastContact,
          daysSinceLastOrder: signal.daysSinceLastOrder,
          overdueFollowupTasks: signal.overdueFollowupTasks,
          debtAmount: signal.debtAmount,
          lastContactAt: signal.lastContactAt?.toISOString() ?? null,
          lastOrderAt: signal.lastOrderAt?.toISOString() ?? null,
        },
        suggestion: {
          suggestedStage: suggestion.suggestedStage,
          suggestedNextActionType: suggestion.suggestedNextActionType,
        },
      });
    }

    items.sort((a, b) => b.priorityScore - a.priorityScore);
    const total = items.length;
    const pagedItems = items.slice(skip, skip + pageSize);

    return {
      items: pagedItems,
      total,
      page,
      pageSize,
      appliedExclusionRules: ["DO_NOT_DISTURB", "NON_TARGET_STATUS", "DUPLICATE_MARKED"],
    };
  }

  async getWorkQueueSummary(query: GetWorkQueueSummaryDto, actor?: AuthUser) {
    const where = this.buildWhere(query, actor);
    const rows = await this.prisma.contact.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        status: true,
        marketingCallOptOut: true,
      },
      // Phase 1 safety limit to avoid expensive full-table scans in summary endpoint.
      take: 2000,
    });
    const signalsById = await this.insights.buildSignalsForContacts(
      rows.map((r) => ({ id: r.id, createdAt: r.createdAt })),
      actor,
    );

    let totalInQueue = 0;
    let excludedCount = 0;
    let scoreSum = 0;
    const reasonCount = new Map<string, number>();
    let overdueFollowup = 0;
    let newNoFirstContact = 0;
    let dormantReturn = 0;
    let atRisk = 0;
    let debtControl = 0;
    const presetCounts = {
      attention: 0,
      overdue: 0,
      "new-no-first-contact": 0,
      "debt-control": 0,
      "return-to-work": 0,
      "risk-or-dormant": 0,
    };

    for (const row of rows) {
      const exclusions = this.insights.buildExclusionSet(row);
      if (exclusions.length > 0) {
        excludedCount += 1;
        continue;
      }
      const signal = signalsById.get(row.id);
      if (!signal) continue;
      const pr = this.priority.score(signal);
      if (this.matchesPreset(pr.reasons, "attention")) presetCounts.attention += 1;
      if (this.matchesPreset(pr.reasons, "overdue")) presetCounts.overdue += 1;
      if (this.matchesPreset(pr.reasons, "new-no-first-contact")) {
        presetCounts["new-no-first-contact"] += 1;
      }
      if (this.matchesPreset(pr.reasons, "debt-control")) presetCounts["debt-control"] += 1;
      if (this.matchesPreset(pr.reasons, "return-to-work")) presetCounts["return-to-work"] += 1;
      if (this.matchesPreset(pr.reasons, "risk-or-dormant")) presetCounts["risk-or-dormant"] += 1;
      if (!this.matchesPreset(pr.reasons, query.preset)) continue;

      totalInQueue += 1;
      scoreSum += pr.score;
      for (const r of pr.reasons) {
        reasonCount.set(r, (reasonCount.get(r) ?? 0) + 1);
      }
      if (pr.reasons.includes("OVERDUE_FOLLOWUP")) overdueFollowup += 1;
      if (pr.reasons.includes("NEW_LEAD_NO_FIRST_CONTACT")) newNoFirstContact += 1;
      if (pr.reasons.includes("RETURN_TO_WORK") || pr.reasons.includes("DORMANT")) dormantReturn += 1;
      if (pr.reasons.includes("AT_RISK")) atRisk += 1;
      if (pr.reasons.includes("HAS_DEBT")) debtControl += 1;
    }

    return {
      totalInQueue,
      excludedCount,
      buckets: {
        overdueFollowup,
        newNoFirstContact,
        dormantReturn,
        atRisk,
        debtControl,
      },
      topReasons: Array.from(reasonCount.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      avgPriorityScore: totalInQueue > 0 ? Number((scoreSum / totalInQueue).toFixed(2)) : 0,
      presetCounts,
      computedAt: new Date().toISOString(),
    };
  }

  private matchesLegacyReasonFilters(
    reasons: ContactPriorityReasonCode[],
    query: Pick<GetWorkQueueDto, "onlyOverdue" | "onlyDebt" | "onlyNoContact">,
  ): boolean {
    if (query.onlyOverdue === true && !reasons.includes("OVERDUE_FOLLOWUP")) return false;
    if (query.onlyDebt === true && !reasons.includes("HAS_DEBT")) return false;
    if (query.onlyNoContact === true && !reasons.includes("NO_CONTACT_14_DAYS")) return false;
    return true;
  }

  private matchesPreset(
    reasons: ContactPriorityReasonCode[],
    preset?: ContactWorkQueuePreset,
  ): boolean {
    if (!preset) return true;

    switch (preset) {
      case "attention":
        return reasons.length > 0;
      case "overdue":
        return reasons.includes("OVERDUE_FOLLOWUP");
      case "new-no-first-contact":
        return reasons.includes("NEW_LEAD_NO_FIRST_CONTACT");
      case "debt-control":
        return reasons.includes("HAS_DEBT");
      case "return-to-work":
        return reasons.includes("RETURN_TO_WORK");
      case "risk-or-dormant":
        return reasons.includes("AT_RISK") || reasons.includes("DORMANT");
      default:
        return true;
    }
  }

  private buildWhere(
    query: {
      ownerId?: string;
      q?: string;
    },
    actor?: AuthUser,
  ): Prisma.ContactWhereInput {
    const andParts: Prisma.ContactWhereInput[] = [];
    if (actor?.role === UserRole.MANAGER) {
      andParts.push({ OR: [{ ownerId: actor.id }, { ownerId: null }] });
    } else if (query.ownerId) {
      andParts.push({ ownerId: query.ownerId });
    }
    if (query.q?.trim()) {
      const q = query.q.trim();
      const digits = q.replace(/\D/g, "");
      andParts.push({
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
          ...(digits.length >= 5 ? [{ phoneNormalized: { contains: digits } }] : []),
        ],
      });
    }
    return andParts.length > 0 ? { AND: andParts } : {};
  }
}
