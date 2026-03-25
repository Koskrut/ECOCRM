import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { AnalyticsScope } from "../analytics-scope.service";
import { buildLeadPeriodWhere } from "../utils/analytics-filter.builder";
import { previousPeriodOfSameLength, type ResolvedPeriod } from "../utils/analytics-date.util";

export type LeadsKpi = {
  total: number;
  won: number;
  lost: number;
  inProgress: number;
  /** WON / total * 100 — proxy, not commercial conversion */
  conversionProxy: number;
  /** Exact lead → order rate when convertedOrderId present (Phase 3+) */
  exactConversionRate?: number;
  leadsWithConvertedOrder?: number;
};

export type LeadsPayload = {
  kpi: LeadsKpi;
  byStatus: { status: string; count: number }[];
  bySource: { source: string; count: number }[];
};

@Injectable()
export class AnalyticsLeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async getLeads(
    period: ResolvedPeriod,
    scope: AnalyticsScope,
    opts?: { compare?: boolean },
  ): Promise<{ period: ResolvedPeriod; data: LeadsPayload; compare?: LeadsPayload }> {
    if (scope.emptyTeam) {
      const empty: LeadsPayload = {
        kpi: {
          total: 0,
          won: 0,
          lost: 0,
          inProgress: 0,
          conversionProxy: 0,
        },
        byStatus: [],
        bySource: [],
      };
      const out: { period: ResolvedPeriod; data: LeadsPayload; compare?: LeadsPayload } = {
        period,
        data: empty,
      };
      if (opts?.compare) out.compare = empty;
      return out;
    }

    const data = await this.compute(period, scope);
    const result: { period: ResolvedPeriod; data: LeadsPayload; compare?: LeadsPayload } = {
      period,
      data,
    };
    if (opts?.compare) {
      result.compare = await this.compute(
        previousPeriodOfSameLength(period.from, period.to),
        scope,
      );
    }
    return result;
  }

  private async compute(period: ResolvedPeriod, scope: AnalyticsScope): Promise<LeadsPayload> {
    const leadWhere = buildLeadPeriodWhere(period.from, period.to, {
      actor: scope.orderScope.actor,
      allowedOwnerIds: scope.orderScope.allowedOwnerIds,
      managerId: scope.orderScope.managerId,
    });

    const [total, won, lost, inProgress, byStatusRows, bySourceRows, convertedCount] =
      await Promise.all([
        this.prisma.lead.count({ where: leadWhere }),
        this.prisma.lead.count({ where: { ...leadWhere, status: "WON" } }),
        this.prisma.lead.count({ where: { ...leadWhere, status: "LOST" } }),
        this.prisma.lead.count({ where: { ...leadWhere, status: "IN_PROGRESS" } }),
        this.prisma.lead.groupBy({
          by: ["status"],
          where: leadWhere,
          _count: { id: true },
        }),
        this.prisma.lead.groupBy({
          by: ["source"],
          where: { ...leadWhere, NOT: { status: "SPAM" } },
          _count: { id: true },
        }),
        this.prisma.lead.count({
          where: { ...leadWhere, convertedOrderId: { not: null } },
        }),
      ]);

    const conversionProxy = total > 0 ? Math.round((won / total) * 10000) / 100 : 0;
    const exactConversionRate =
      total > 0 ? Math.round((convertedCount / total) * 10000) / 100 : 0;

    return {
      kpi: {
        total,
        won,
        lost,
        inProgress,
        conversionProxy,
        exactConversionRate,
        leadsWithConvertedOrder: convertedCount,
      },
      byStatus: byStatusRows.map((r) => ({ status: r.status, count: r._count.id })),
      bySource: bySourceRows.map((r) => ({ source: r.source, count: r._count.id })),
    };
  }
}
