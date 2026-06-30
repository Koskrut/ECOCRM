import { Injectable } from "@nestjs/common";
import { UserRole, VisitStatus } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { AnalyticsScopeService } from "../analytics/analytics-scope.service";
import { AnalyticsLeadsService } from "../analytics/services/analytics-leads.service";
import { AnalyticsManagersService } from "../analytics/services/analytics-managers.service";
import { AnalyticsOverviewService } from "../analytics/services/analytics-overview.service";
import { AnalyticsQualityService } from "../analytics/services/analytics-quality.service";
import { resolvePresetPeriod } from "../analytics/utils/analytics-date.util";
import { kyivDayBounds, todayYmdKyiv } from "../crm-timezone";
import { DailyAgendaService } from "../daily-agenda/daily-agenda.service";
import { DayPlanService } from "../day-plan/day-plan.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  DashboardService,
  type DashboardPeriod,
  type DailyTeamActivityPayload,
} from "./dashboard.service";
import type {
  DashboardV2ManagerRow,
  DashboardV2Response,
  DashboardV2TaskSummary,
  DashboardV2TeamPulseRow,
} from "./dashboard-v2.types";

const DATE_YMD = /^\d{4}-\d{2}-\d{2}$/;

function parseActivityDate(raw: string | undefined): string {
  const trimmed = raw?.trim();
  if (trimmed && DATE_YMD.test(trimmed)) return trimmed;
  return todayYmdKyiv();
}

function parsePeriod(raw: string | undefined): DashboardPeriod {
  return raw === "week" || raw === "month" ? raw : "month";
}

@Injectable()
export class DashboardV2Service {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly scopeService: AnalyticsScopeService,
    private readonly overviewService: AnalyticsOverviewService,
    private readonly leadsService: AnalyticsLeadsService,
    private readonly managersService: AnalyticsManagersService,
    private readonly qualityService: AnalyticsQualityService,
    private readonly dayPlan: DayPlanService,
    private readonly dailyAgenda: DailyAgendaService,
    private readonly prisma: PrismaService,
  ) {}

  async getV2(
    actor: AuthUser,
    opts?: {
      period?: string;
      activityDate?: string;
      compare?: boolean;
      managerId?: string;
    },
  ): Promise<DashboardV2Response> {
    const periodKey = parsePeriod(opts?.period);
    const activityDate = parseActivityDate(opts?.activityDate);
    const resolvedPeriod = resolvePresetPeriod(periodKey);
    const scope = await this.scopeService.resolveDashboardScope(actor, {
      managerId: opts?.managerId,
    });

    const showTeamView = actor.role === UserRole.ADMIN || actor.role === UserRole.LEAD;
    const trendUserIds = await this.resolveTrendUserIds(actor, scope);

    const [overview, leads, teamActivity, myWork, quality, managers] = await Promise.all([
      this.overviewService.getOverview(resolvedPeriod, scope, {
        compare: opts?.compare === true,
      }),
      this.leadsService.getLeads(resolvedPeriod, scope),
      this.dashboard.getDailyTeamActivity(activityDate, actor),
      this.loadMyWork(actor, activityDate),
      this.qualityService.getQuality(resolvedPeriod, scope, {
        trendUserIds,
        activityDate,
      }),
      showTeamView
        ? this.buildManagers(resolvedPeriod, scope, activityDate)
        : Promise.resolve(undefined),
    ]);

    const enrichedTeamPulse = await this.enrichTeamPulse(teamActivity, activityDate);

    const role =
      actor.role === UserRole.ADMIN
        ? "ADMIN"
        : actor.role === UserRole.LEAD
          ? "LEAD"
          : "MANAGER";

    return {
      role,
      currency: overview.currency,
      period: {
        from: resolvedPeriod.from.toISOString(),
        to: resolvedPeriod.to.toISOString(),
      },
      activityDate,
      sales: {
        kpi: overview.data.kpi,
        compare: overview.compare,
        charts: {
          ...overview.data.charts,
          leadsByStatus: leads.data.charts.byStatus.map((r) => ({
            status: r.status,
            count: r.count,
          })),
          leadsBySource: leads.data.charts.bySource.map((r) => ({
            source: r.source,
            count: r.count,
          })),
        },
      },
      attention: overview.data.attention,
      teamPulse: {
        date: enrichedTeamPulse.date,
        currency: enrichedTeamPulse.currency,
        rows: enrichedTeamPulse.rows,
      },
      myWork,
      managers,
      quality,
      showTeamView,
    };
  }

  private async loadMyWork(actor: AuthUser, activityDate: string): Promise<DashboardV2Response["myWork"]> {
    const [dayPlanResult, agendaResult, tasks] = await Promise.all([
      this.dayPlan.getDayPlan(activityDate, actor).catch(() => null),
      this.dailyAgenda.getAgenda(activityDate, actor).catch(() => null),
      this.loadUpcomingTasks(actor.id),
    ]);

    return {
      dayPlan: dayPlanResult,
      agenda: agendaResult,
      upcomingTasks: tasks,
    };
  }

  private async loadUpcomingTasks(assigneeId: string): Promise<DashboardV2TaskSummary[]> {
    const rows = await this.prisma.task.findMany({
      where: {
        assigneeId,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      take: 10,
      select: { id: true, title: true, dueAt: true, status: true },
    });
    return rows.map((t) => ({
      id: t.id,
      title: t.title,
      dueAt: t.dueAt?.toISOString() ?? null,
      status: t.status,
    }));
  }

  private async enrichTeamPulse(
    payload: DailyTeamActivityPayload,
    activityDate: string,
  ): Promise<{ date: string; currency: string; rows: DashboardV2TeamPulseRow[] }> {
    const userIds = payload.rows.map((r) => r.userId);
    if (userIds.length === 0) {
      return { date: payload.date, currency: payload.currency, rows: [] };
    }

    const { from, to } = kyivDayBounds(activityDate);
    const [visitsWithoutNote, overdueTasks] = await Promise.all([
      this.qualityService.getVisitsWithoutNoteForUsers(userIds, from, to),
      this.qualityService.getOverdueTasksForUsers(userIds, to),
    ]);

    const rows: DashboardV2TeamPulseRow[] = payload.rows.map((row) => ({
      ...row,
      overdueTasks: overdueTasks.get(row.userId) ?? 0,
      visitsWithoutNote: visitsWithoutNote.get(row.userId) ?? 0,
    }));

    return { date: payload.date, currency: payload.currency, rows };
  }

  private async buildManagers(
    period: { from: Date; to: Date },
    scope: Awaited<ReturnType<AnalyticsScopeService["resolveDashboardScope"]>>,
    activityDate: string,
  ): Promise<DashboardV2ManagerRow[]> {
    const { managers } = await this.managersService.getManagers(period, scope);
    if (managers.length === 0) return [];

    const managerIds = managers.map((m) => m.id);
    const { from, to } = kyivDayBounds(activityDate);

    const [callGroups, visitGroups, visitsWithoutNote, dayPlanScores, periodVisitNoNote] =
      await Promise.all([
        this.prisma.call.groupBy({
          by: ["managerUserId"],
          where: {
            startedAt: { gte: period.from, lte: period.to },
            direction: "OUTBOUND",
            managerUserId: { in: managerIds },
          },
          _count: { id: true },
        }),
        this.prisma.visit.groupBy({
          by: ["ownerId"],
          where: {
            ownerId: { in: managerIds },
            status: VisitStatus.DONE,
            completedAt: { gte: period.from, lte: period.to },
          },
          _count: { id: true },
        }),
        this.qualityService.getVisitsWithoutNoteForUsers(managerIds, period.from, period.to),
        this.dayPlan.getOverallPercentsForUsers(managerIds, activityDate),
        this.qualityService.getVisitsWithoutNoteForUsers(managerIds, from, to),
      ]);

    const callsMap = new Map(
      callGroups
        .filter((g): g is typeof g & { managerUserId: string } => g.managerUserId != null)
        .map((g) => [g.managerUserId, g._count.id] as const),
    );
    const visitsMap = new Map(visitGroups.map((g) => [g.ownerId, g._count.id] as const));

    return managers.map((m) => {
      const dp = dayPlanScores.get(m.id);
      return {
        ...m,
        callsOutbound: callsMap.get(m.id) ?? 0,
        visitsDone: visitsMap.get(m.id) ?? 0,
        visitsWithoutNote: visitsWithoutNote.get(m.id) ?? periodVisitNoNote.get(m.id) ?? 0,
        dayPlanPercent: dp?.percent ?? 0,
        dayPlanStatus: dp?.status ?? "red",
      };
    });
  }

  private async resolveTrendUserIds(
    actor: AuthUser,
    scope: Awaited<ReturnType<AnalyticsScopeService["resolveDashboardScope"]>>,
  ): Promise<string[]> {
    if (actor.role === UserRole.MANAGER) return [actor.id];
    if (scope.orderScope.managerId) return [scope.orderScope.managerId];
    if (scope.orderScope.allowedOwnerIds !== undefined) {
      return scope.orderScope.allowedOwnerIds;
    }
    const rows = await this.prisma.user.findMany({
      where: { role: { in: [UserRole.MANAGER, UserRole.LEAD, UserRole.ADMIN] } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}
