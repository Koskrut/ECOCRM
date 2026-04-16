import { Injectable } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { AnalyticsScope } from "../analytics-scope.service";
import { buildLeadPeriodWhere, buildOverdueTaskWhereForPeriod } from "../utils/analytics-filter.builder";
import { previousPeriodOfSameLength, type ResolvedPeriod } from "../utils/analytics-date.util";

export type LeadsCharts = {
  leadsCreatedByDay: { date: string; count: number }[];
  bySource: { source: string; count: number }[];
  byStatus: { status: string; count: number }[];
  lostReasons?: { reason: string; count: number }[];
};

export type LeadsTableRow = { key: string; count: number; share: number };

export type LeadsAttention = {
  /** NEW / IN_PROGRESS “no touch” rules vs period end; createdAt in selected period (see overview). */
  leadsWithoutTouchCount: number;
  /** NEW leads created in period with zero activities. */
  neverContactedNewLeadsCount: number;
  /** IN_PROGRESS in period, stale vs period end (7d activity window). */
  staleInProgressLeadsCount: number;
  /** Leads created in period with ownerId null. */
  leadsWithoutOwnerCount: number;
  /** Leads created in period with source OTHER. */
  leadsUnknownSourceProxyCount: number;
  /** Open lead tasks with dueAt in the selected period. */
  overdueLeadTasksCount: number;
};

export type LeadsPayload = {
  kpi: {
    /** Leads with createdAt in the selected period (same as former `total`). */
    leadsCreated: number;
    won: number;
    lost: number;
    inProgress: number;
    /** won / leadsCreated in period — proxy, not order revenue conversion. */
    wonShareProxy: number;
    exactConversionRate?: number;
    leadsWithConvertedOrder?: number;
  };
  charts: LeadsCharts;
  tables: {
    bySource: LeadsTableRow[];
    byStatus: LeadsTableRow[];
  };
  attention: LeadsAttention;
};

type LeadOwnerScope = Prisma.LeadWhereInput;

@Injectable()
export class AnalyticsLeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async getLeads(
    period: ResolvedPeriod,
    scope: AnalyticsScope,
    opts?: { compare?: boolean },
  ): Promise<{ period: ResolvedPeriod; data: LeadsPayload; compare?: LeadsPayload }> {
    if (scope.emptyTeam) {
      const empty = this.emptyPayload();
      const data = empty;
      return { period, data, compare: opts?.compare ? empty : undefined };
    }
    const data = await this.compute(period, scope, { includeAttention: true });
    const result: { period: ResolvedPeriod; data: LeadsPayload; compare?: LeadsPayload } = {
      period,
      data,
    };
    if (opts?.compare) {
      result.compare = await this.compute(previousPeriodOfSameLength(period.from, period.to), scope, {
        includeAttention: true,
      });
    }
    return result;
  }

  private emptyPayload(): LeadsPayload {
    const z: LeadsPayload["kpi"] = {
      leadsCreated: 0,
      won: 0,
      lost: 0,
      inProgress: 0,
      wonShareProxy: 0,
    };
    const charts: LeadsCharts = {
      leadsCreatedByDay: [],
      bySource: [],
      byStatus: [],
    };
    const att: LeadsAttention = {
      leadsWithoutTouchCount: 0,
      neverContactedNewLeadsCount: 0,
      staleInProgressLeadsCount: 0,
      leadsWithoutOwnerCount: 0,
      leadsUnknownSourceProxyCount: 0,
      overdueLeadTasksCount: 0,
    };
    return {
      kpi: z,
      charts,
      tables: { bySource: [], byStatus: [] },
      attention: att,
    };
  }

  private buildLeadOwnerScope(scope: AnalyticsScope): LeadOwnerScope {
    const s = scope.orderScope;
    if (s.managerId) return { ownerId: s.managerId };
    if (s.actor.role === UserRole.MANAGER) {
      return { OR: [{ ownerId: s.actor.id }, { ownerId: null }] };
    }
    if (s.allowedOwnerIds && s.allowedOwnerIds.length > 0) {
      return { OR: [{ ownerId: { in: s.allowedOwnerIds } }, { ownerId: null }] };
    }
    return {};
  }

  private async countLeadsWithoutTouch(ownerFilter: LeadOwnerScope, period: ResolvedPeriod): Promise<number> {
    const asOf = period.to;
    const cutoffNew = new Date(asOf);
    cutoffNew.setDate(cutoffNew.getDate() - 3);
    const cutoffIp = new Date(asOf);
    cutoffIp.setDate(cutoffIp.getDate() - 7);
    const newUpper = period.to < cutoffNew ? period.to : cutoffNew;
    const ipUpper = period.to < cutoffIp ? period.to : cutoffIp;

    const [newLeads, ipLeads] = await Promise.all([
      this.prisma.lead.count({
        where: {
          ...ownerFilter,
          status: "NEW",
          createdAt: { gte: period.from, lte: newUpper },
          NOT: { activities: { some: { createdAt: { gte: cutoffNew } } } },
        },
      }),
      this.prisma.lead.count({
        where: {
          ...ownerFilter,
          status: "IN_PROGRESS",
          createdAt: { gte: period.from, lte: ipUpper },
          NOT: { activities: { some: { createdAt: { gte: cutoffIp } } } },
        },
      }),
    ]);
    return newLeads + ipLeads;
  }

  private async compute(
    period: ResolvedPeriod,
    scope: AnalyticsScope,
    opts: { includeAttention: boolean },
  ): Promise<LeadsPayload> {
    const leadWhere = buildLeadPeriodWhere(period.from, period.to, {
      actor: scope.orderScope.actor,
      allowedOwnerIds: scope.orderScope.allowedOwnerIds,
      managerId: scope.orderScope.managerId,
    });
    const ownerScope = this.buildLeadOwnerScope(scope);

    const [
      leadsCreated,
      won,
      lost,
      inProgress,
      byStatus,
      bySource,
      lostReasonGroups,
      createdAtRows,
      neverContactedNew,
      staleIp,
      withoutOwner,
      unknownSource,
      overdueLeadTasks,
      noTouch,
    ] = await Promise.all([
      this.prisma.lead.count({ where: leadWhere }),
      this.prisma.lead.count({ where: { ...leadWhere, status: "WON" } }),
      this.prisma.lead.count({ where: { ...leadWhere, status: "LOST" } }),
      this.prisma.lead.count({ where: { ...leadWhere, status: "IN_PROGRESS" } }),
      this.prisma.lead.groupBy({ by: ["status"], where: leadWhere, _count: { id: true } }),
      this.prisma.lead.groupBy({ by: ["source"], where: leadWhere, _count: { id: true } }),
      this.prisma.lead.groupBy({
        by: ["statusReason"],
        where: { ...leadWhere, status: "LOST" },
        _count: { id: true },
      }),
      // PERF: loads createdAt for every lead in-window to bucket by day; consider DB date_trunc if this grows large.
      this.prisma.lead.findMany({ where: leadWhere, select: { createdAt: true } }),
      opts.includeAttention
        ? this.prisma.lead.count({
            where: { AND: [leadWhere, { status: "NEW", activities: { none: {} } }] },
          })
        : Promise.resolve(0),
      opts.includeAttention
        ? (() => {
            const cutoffIp = new Date(period.to);
            cutoffIp.setDate(cutoffIp.getDate() - 7);
            return this.prisma.lead.count({
              where: {
                AND: [
                  leadWhere,
                  {
                    status: "IN_PROGRESS",
                    createdAt: { lte: cutoffIp },
                    NOT: {
                      activities: { some: { createdAt: { gte: cutoffIp } } },
                    },
                  },
                ],
              },
            });
          })()
        : Promise.resolve(0),
      opts.includeAttention
        ? this.prisma.lead.count({ where: { AND: [leadWhere, { ownerId: null }] } })
        : Promise.resolve(0),
      opts.includeAttention
        ? this.prisma.lead.count({ where: { AND: [leadWhere, { source: "OTHER" }] } })
        : Promise.resolve(0),
      opts.includeAttention
        ? this.prisma.task.count({
            where: {
              ...buildOverdueTaskWhereForPeriod(period.from, period.to, {
                managerId: scope.orderScope.managerId,
                allowedAssigneeIds: scope.allowedAssigneeIds,
              }),
              leadId: { not: null },
            },
          })
        : Promise.resolve(0),
      opts.includeAttention ? this.countLeadsWithoutTouch(ownerScope, period) : Promise.resolve(0),
    ]);

    let converted: number | null = null;
    try {
      converted = await this.prisma.lead.count({ where: { ...leadWhere, convertedOrderId: { not: null } } });
    } catch (error) {
      const originalMessage = String(
        (error as { meta?: { driverAdapterError?: { cause?: { originalMessage?: string } } } })?.meta
          ?.driverAdapterError?.cause?.originalMessage ?? "",
      );
      const isMissingConvertedOrderId =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2022" &&
        originalMessage.includes("convertedOrderId");
      if (!isMissingConvertedOrderId) throw error;
      converted = null;
    }

    const byDay = new Map<string, number>();
    for (const row of createdAtRows) {
      const date = row.createdAt.toISOString().slice(0, 10);
      byDay.set(date, (byDay.get(date) ?? 0) + 1);
    }
    const leadsCreatedByDay = Array.from(byDay.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const byStatusRows = byStatus.map((r) => ({ status: r.status, count: r._count.id }));
    const bySourceRows = bySource.map((r) => ({ source: r.source, count: r._count.id }));

    const lostReasons = lostReasonGroups
      .map((r) => ({
        reason: r.statusReason?.trim() ? r.statusReason : "(не вказано)",
        count: r._count.id,
      }))
      .sort((a, b) => b.count - a.count);

    const charts: LeadsCharts = {
      leadsCreatedByDay,
      bySource: bySourceRows,
      byStatus: byStatusRows,
      lostReasons: lostReasons.length > 0 ? lostReasons : undefined,
    };

    const tables = {
      bySource: this.withShare(bySourceRows.map((r) => ({ key: r.source, count: r.count })), leadsCreated),
      byStatus: this.withShare(byStatusRows.map((r) => ({ key: r.status, count: r.count })), leadsCreated),
    };

    const attention: LeadsAttention = opts.includeAttention
      ? {
          leadsWithoutTouchCount: noTouch,
          neverContactedNewLeadsCount: neverContactedNew,
          staleInProgressLeadsCount: staleIp,
          leadsWithoutOwnerCount: withoutOwner,
          leadsUnknownSourceProxyCount: unknownSource,
          overdueLeadTasksCount: overdueLeadTasks,
        }
      : {
          leadsWithoutTouchCount: 0,
          neverContactedNewLeadsCount: 0,
          staleInProgressLeadsCount: 0,
          leadsWithoutOwnerCount: 0,
          leadsUnknownSourceProxyCount: 0,
          overdueLeadTasksCount: 0,
        };

    return {
      kpi: {
        leadsCreated,
        won,
        lost,
        inProgress,
        wonShareProxy: leadsCreated > 0 ? Math.round((won / leadsCreated) * 10000) / 100 : 0,
        exactConversionRate:
          converted != null && leadsCreated > 0 ? Math.round((converted / leadsCreated) * 10000) / 100 : undefined,
        leadsWithConvertedOrder: converted ?? undefined,
      },
      charts,
      tables,
      attention,
    };
  }

  private withShare(rows: { key: string; count: number }[], periodTotal: number): LeadsTableRow[] {
    return rows
      .map((r) => ({
        key: r.key,
        count: r.count,
        share: periodTotal > 0 ? Math.round((r.count / periodTotal) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }
}
