import { Injectable } from "@nestjs/common";
import { VisitGpsVerification, VisitStatus } from "@prisma/client";
import type { DayPlanStatus } from "../../day-plan/day-plan.types";
import { DayPlanService } from "../../day-plan/day-plan.service";
import { instantToKyivYmd } from "../../crm-timezone";
import { PrismaService } from "../../prisma/prisma.service";
import type { AnalyticsScope } from "../analytics-scope.service";
import type { ResolvedPeriod } from "../utils/analytics-date.util";

export type QualityVisitsSummary = {
  totalDone: number;
  byOutcome: { outcome: string; count: number }[];
  withoutResultNote: number;
  withFollowUp: number;
  gpsVerifiedStart: number;
  gpsVerifiedComplete: number;
};

export type QualitySummary = {
  visits: QualityVisitsSummary;
  dayPlanTrend: { date: string; percent: number; status: DayPlanStatus }[];
  overdueFollowUps: number;
  calls: { inbound: number; outbound: number };
};

type OwnerFilter = { ownerId?: string | { in: string[] } };

@Injectable()
export class AnalyticsQualityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dayPlan: DayPlanService,
  ) {}

  private buildOwnerFilter(scope: AnalyticsScope): OwnerFilter {
    if (scope.orderScope.managerId) return { ownerId: scope.orderScope.managerId };
    if (scope.orderScope.allowedOwnerIds !== undefined) {
      return { ownerId: { in: scope.orderScope.allowedOwnerIds } };
    }
    return {};
  }

  async getQuality(
    period: ResolvedPeriod,
    scope: AnalyticsScope,
    opts?: { trendUserIds?: string[]; activityDate?: string },
  ): Promise<QualitySummary> {
    if (scope.emptyTeam) {
      return this.emptyQuality();
    }

    const ownerFilter = this.buildOwnerFilter(scope);
    const visitWhere = {
      ...ownerFilter,
      status: VisitStatus.DONE,
      completedAt: { gte: period.from, lte: period.to },
    };

    const callWhere = {
      startedAt: { gte: period.from, lte: period.to },
      ...(scope.orderScope.managerId
        ? { managerUserId: scope.orderScope.managerId }
        : scope.orderScope.allowedOwnerIds !== undefined
          ? { managerUserId: { in: scope.orderScope.allowedOwnerIds } }
          : {}),
    };

    const contactWhere =
      scope.orderScope.managerId != null
        ? { ownerId: scope.orderScope.managerId }
        : scope.orderScope.allowedOwnerIds !== undefined
          ? { ownerId: { in: scope.orderScope.allowedOwnerIds } }
          : {};

    const [totalDone, byOutcomeRows, withoutResultNote, withFollowUp, gpsStart, gpsComplete, callGroups, overdueFollowUps] =
      await Promise.all([
        this.prisma.visit.count({ where: visitWhere }),
        this.prisma.visit.groupBy({
          by: ["outcome"],
          where: { ...visitWhere, outcome: { not: null } },
          _count: { id: true },
        }),
        this.prisma.visit.count({
          where: {
            ...visitWhere,
            OR: [{ resultNote: null }, { resultNote: "" }],
          },
        }),
        this.prisma.visit.count({
          where: { ...visitWhere, nextActionAt: { not: null } },
        }),
        this.prisma.visit.count({
          where: {
            ...visitWhere,
            startGpsVerification: VisitGpsVerification.VERIFIED,
          },
        }),
        this.prisma.visit.count({
          where: {
            ...visitWhere,
            completeGpsVerification: VisitGpsVerification.VERIFIED,
          },
        }),
        this.prisma.call.groupBy({
          by: ["direction"],
          where: callWhere,
          _count: { id: true },
        }),
        Object.keys(contactWhere).length > 0
          ? this.prisma.contact.count({
              where: {
                ...contactWhere,
                nextActionAt: { not: null, lt: new Date() },
              },
            })
          : this.prisma.contact.count({
              where: { nextActionAt: { not: null, lt: new Date() } },
            }),
      ]);

    let inbound = 0;
    let outbound = 0;
    for (const g of callGroups) {
      const dir = (g.direction || "").toUpperCase();
      if (dir === "INBOUND") inbound += g._count.id;
      else if (dir === "OUTBOUND") outbound += g._count.id;
    }

    const trendUserIds = opts?.trendUserIds ?? [];
    const dayPlanTrend = await this.buildDayPlanTrend(trendUserIds, period, opts?.activityDate);

    return {
      visits: {
        totalDone,
        byOutcome: byOutcomeRows.map((r) => ({
          outcome: r.outcome ?? "UNKNOWN",
          count: r._count.id,
        })),
        withoutResultNote,
        withFollowUp,
        gpsVerifiedStart: gpsStart,
        gpsVerifiedComplete: gpsComplete,
      },
      dayPlanTrend,
      overdueFollowUps,
      calls: { inbound, outbound },
    };
  }

  async getVisitsWithoutNoteForUsers(
    userIds: string[],
    from: Date,
    to: Date,
  ): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const groups = await this.prisma.visit.groupBy({
      by: ["ownerId"],
      where: {
        ownerId: { in: userIds },
        status: VisitStatus.DONE,
        completedAt: { gte: from, lte: to },
        OR: [{ resultNote: null }, { resultNote: "" }],
      },
      _count: { id: true },
    });
    return new Map(groups.map((g) => [g.ownerId, g._count.id]));
  }

  async getOverdueTasksForUsers(userIds: string[], asOf: Date): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const groups = await this.prisma.task.groupBy({
      by: ["assigneeId"],
      where: {
        assigneeId: { in: userIds },
        status: { in: ["OPEN", "IN_PROGRESS"] },
        dueAt: { not: null, lt: asOf },
      },
      _count: { id: true },
    });
    return new Map(groups.map((g) => [g.assigneeId, g._count.id]));
  }

  private async buildDayPlanTrend(
    userIds: string[],
    period: ResolvedPeriod,
    activityDate?: string,
  ): Promise<{ date: string; percent: number; status: DayPlanStatus }[]> {
    if (userIds.length === 0) return [];

    const dates: string[] = [];
    const endYmd = activityDate ?? instantToKyivYmd(period.to);
    const start = new Date(period.from);
    const end = new Date(period.to);
    const msPerDay = 86400000;
    const dayCount = Math.min(
      14,
      Math.max(1, Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1),
    );

    for (let i = dayCount - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(d.getDate() - i);
      dates.push(instantToKyivYmd(d));
    }
    if (!dates.includes(endYmd)) {
      dates.push(endYmd);
      dates.sort();
    }

    const primaryUserId = userIds[0];
    const trend: { date: string; percent: number; status: DayPlanStatus }[] = [];

    for (const date of [...new Set(dates)].slice(-14)) {
      const scores = await this.dayPlan.getOverallPercentsForUsers(
        userIds.length === 1 ? [primaryUserId] : userIds,
        date,
      );
      if (userIds.length === 1) {
        const s = scores.get(primaryUserId);
        trend.push({ date, percent: s?.percent ?? 0, status: s?.status ?? "red" });
      } else {
        let sum = 0;
        let count = 0;
        for (const uid of userIds) {
          const s = scores.get(uid);
          if (s) {
            sum += s.percent;
            count += 1;
          }
        }
        const avg = count > 0 ? Math.round(sum / count) : 0;
        const status: DayPlanStatus = avg >= 80 ? "green" : avg >= 50 ? "yellow" : "red";
        trend.push({ date, percent: avg, status });
      }
    }

    return trend.sort((a, b) => a.date.localeCompare(b.date));
  }

  private emptyQuality(): QualitySummary {
    return {
      visits: {
        totalDone: 0,
        byOutcome: [],
        withoutResultNote: 0,
        withFollowUp: 0,
        gpsVerifiedStart: 0,
        gpsVerifiedComplete: 0,
      },
      dayPlanTrend: [],
      overdueFollowUps: 0,
      calls: { inbound: 0, outbound: 0 },
    };
  }
}
