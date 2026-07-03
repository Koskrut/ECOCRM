import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types";
import { AnalyticsScopeService } from "../analytics/analytics-scope.service";
import { AnalyticsLeadsService } from "../analytics/services/analytics-leads.service";
import { AnalyticsOverviewService } from "../analytics/services/analytics-overview.service";
import { AnalyticsQualityService } from "../analytics/services/analytics-quality.service";
import {
  previousPeriodOfSameLength,
  resolvePresetPeriod,
  type ResolvedPeriod,
} from "../analytics/utils/analytics-date.util";
import { ContactsWorkQueueService } from "../contacts/contacts-work-queue.service";
import { todayYmdKyiv } from "../crm-timezone";
import { PrismaService } from "../prisma/prisma.service";
import { DashboardService } from "./dashboard.service";
import type {
  ManagerActivityMetrics,
  ManagerHotLead,
  ManagerInboxResponse,
  ManagerInboxTask,
  ManagerInboxTasks,
  ManagerPipelineCounts,
  ManagerScorecardResponse,
} from "./manager-dashboard.types";

function parsePeriod(raw: string | undefined): "week" | "month" {
  return raw === "week" ? "week" : "month";
}

function leadDisplayName(lead: {
  lastName: string | null;
  firstName: string | null;
  middleName: string | null;
  companyName: string | null;
  fullName: string | null;
  name: string | null;
}): string {
  const personName = [lead.lastName, lead.firstName, lead.middleName]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ")
    .trim();
  return personName || lead.companyName || lead.fullName || lead.name || "—";
}

@Injectable()
export class ManagerDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: AnalyticsScopeService,
    private readonly overviewService: AnalyticsOverviewService,
    private readonly leadsService: AnalyticsLeadsService,
    private readonly qualityService: AnalyticsQualityService,
    private readonly workQueue: ContactsWorkQueueService,
    private readonly dashboard: DashboardService,
  ) {}

  async getInbox(
    actor: AuthUser,
    opts?: { period?: string },
  ): Promise<ManagerInboxResponse> {
    const period = resolvePresetPeriod(parsePeriod(opts?.period));
    const scope = await this.scopeService.resolveDashboardScope(actor);
    const now = new Date();

    const [leads, overview, summary, tasks, hotLeads] = await Promise.all([
      this.leadsService.getLeads(period, scope),
      this.overviewService.getOverview(period, scope),
      this.workQueue.getWorkQueueSummary({}, actor),
      this.loadGroupedTasks(actor.id, now),
      this.loadHotLeads(actor.id, now),
    ]);

    const attention = leads.data.attention;
    const pipelineCounts = this.pipelineFromStatuses(leads.data.charts.byStatus);

    return {
      tiles: {
        leadsWithoutTouch: attention.leadsWithoutTouchCount,
        neverContactedNewLeads: attention.neverContactedNewLeadsCount,
        staleInProgressLeads: attention.staleInProgressLeadsCount,
        overdueFollowupContacts: summary.buckets.overdueFollowup,
        newNoFirstContactContacts: summary.buckets.newNoFirstContact,
        overdueTasks: overview.data.attention.crm.overdueTasksCount,
        overduePayments: overview.data.attention.finance.overdueOrdersCount,
        debtControlContacts: summary.buckets.debtControl,
      },
      tasks,
      pipelineCounts,
      hotLeads,
      totalInQueue: summary.totalInQueue,
      computedAt: new Date().toISOString(),
    };
  }

  async getScorecard(
    actor: AuthUser,
    opts?: { period?: string; compare?: boolean },
  ): Promise<ManagerScorecardResponse> {
    const periodKey = parsePeriod(opts?.period);
    const period = resolvePresetPeriod(periodKey);
    const compare = opts?.compare === true;
    const scope = await this.scopeService.resolveDashboardScope(actor);
    const today = todayYmdKyiv();

    const comparePeriod = compare
      ? previousPeriodOfSameLength(period.from, period.to)
      : undefined;

    const [overview, leads, quality, todayActivity, summary, compareQuality] =
      await Promise.all([
        this.overviewService.getOverview(period, scope, { compare }),
        this.leadsService.getLeads(period, scope, { compare }),
        this.qualityService.getQuality(period, scope),
        this.dashboard.getDailyTeamActivity(today, actor),
        this.workQueue.getWorkQueueSummary({}, actor),
        comparePeriod
          ? this.qualityService.getQuality(comparePeriod, scope)
          : Promise.resolve(null),
      ]);

    const todayRow = todayActivity.rows.find((r) => r.userId === actor.id);
    const todayMetrics: ManagerActivityMetrics = {
      callsInbound: todayRow?.callsInbound ?? 0,
      callsOutbound: todayRow?.callsOutbound ?? 0,
      visits: todayRow?.visits ?? 0,
      ordersCount: todayRow?.ordersCount ?? 0,
      ordersAmount: todayRow?.ordersAmount ?? 0,
      paymentsAmount: todayRow?.paymentsAmount ?? 0,
    };

    const periodMetrics: ManagerActivityMetrics = {
      callsInbound: quality.calls.inbound,
      callsOutbound: quality.calls.outbound,
      visits: quality.visits.totalDone,
      ordersCount: overview.data.kpi.ordersCount,
      ordersAmount: overview.data.kpi.bookedRevenue,
      paymentsAmount: overview.data.kpi.collectedPayments,
    };

    const compareMetrics: ManagerActivityMetrics | undefined =
      compare && overview.compare && compareQuality
        ? {
            callsInbound: compareQuality.calls.inbound,
            callsOutbound: compareQuality.calls.outbound,
            visits: compareQuality.visits.totalDone,
            ordersCount: overview.compare.kpi.ordersCount,
            ordersAmount: overview.compare.kpi.bookedRevenue,
            paymentsAmount: overview.compare.kpi.collectedPayments,
          }
        : undefined;

    const leadKpi = leads.data.kpi;
    const outcomes: ManagerScorecardResponse["outcomes"] = {
      leadsCreated: leadKpi.leadsCreated,
      leadsWon: leadKpi.won,
      leadsLost: leadKpi.lost,
      wonShare: leadKpi.wonShareProxy,
      exactConversion: leadKpi.exactConversionRate ?? null,
      bookedRevenue: overview.data.kpi.bookedRevenue,
      collectedPayments: overview.data.kpi.collectedPayments,
      avgCheck: overview.data.kpi.avgCheck,
      activeClientsInQueue: summary.totalInQueue,
    };

    if (compare && leads.compare && overview.compare) {
      const cmpLead = leads.compare.kpi;
      outcomes.compare = {
        leadsCreated: cmpLead.leadsCreated,
        leadsWon: cmpLead.won,
        leadsLost: cmpLead.lost,
        wonShare: cmpLead.wonShareProxy,
        bookedRevenue: overview.compare.kpi.bookedRevenue,
        collectedPayments: overview.compare.kpi.collectedPayments,
        avgCheck: overview.compare.kpi.avgCheck,
      };
    }

    return {
      currency: overview.currency,
      period: { from: period.from.toISOString(), to: period.to.toISOString() },
      comparePeriod: comparePeriod
        ? { from: comparePeriod.from.toISOString(), to: comparePeriod.to.toISOString() }
        : undefined,
      activity: {
        today: todayMetrics,
        period: periodMetrics,
        compare: compareMetrics,
      },
      outcomes,
    };
  }

  private pipelineFromStatuses(
    rows: { status: string; count: number }[],
  ): ManagerPipelineCounts {
    const counts: ManagerPipelineCounts = { NEW: 0, IN_PROGRESS: 0, WON: 0, LOST: 0 };
    for (const row of rows) {
      if (row.status in counts) {
        counts[row.status as keyof ManagerPipelineCounts] = row.count;
      }
    }
    return counts;
  }

  private async loadGroupedTasks(
    assigneeId: string,
    now: Date,
  ): Promise<ManagerInboxTasks> {
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    const endOfTomorrow = new Date(startOfTomorrow);
    endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);

    const rows = await this.prisma.task.findMany({
      where: {
        assigneeId,
        status: { in: ["OPEN", "IN_PROGRESS"] },
        dueAt: { not: null, lt: endOfTomorrow },
      },
      orderBy: [{ dueAt: "asc" }],
      take: 50,
      select: {
        id: true,
        title: true,
        dueAt: true,
        status: true,
        leadId: true,
        contactId: true,
        assignee: { select: { fullName: true } },
      },
    });

    const tasks: ManagerInboxTasks = { overdue: [], today: [], tomorrow: [] };
    for (const row of rows) {
      if (!row.dueAt) continue;
      const task: ManagerInboxTask = {
        id: row.id,
        title: row.title,
        dueAt: row.dueAt.toISOString(),
        status: row.status,
        leadId: row.leadId ?? null,
        contactId: row.contactId ?? null,
        assigneeName: row.assignee?.fullName ?? null,
      };
      if (row.dueAt < startOfToday) tasks.overdue.push(task);
      else if (row.dueAt < startOfTomorrow) tasks.today.push(task);
      else tasks.tomorrow.push(task);
    }
    return tasks;
  }

  private async loadHotLeads(ownerId: string, now: Date): Promise<ManagerHotLead[]> {
    const rows = await this.prisma.lead.findMany({
      where: { ownerId, status: "IN_PROGRESS" },
      orderBy: [{ lastActivityAt: "asc" }, { updatedAt: "asc" }],
      take: 3,
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        middleName: true,
        fullName: true,
        companyName: true,
        source: true,
        createdAt: true,
        lastActivityAt: true,
        tasks: {
          where: { status: { in: ["OPEN", "IN_PROGRESS"] }, dueAt: { not: null, lt: now } },
          select: { id: true },
          take: 1,
        },
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
        hasOverdueTask: lead.tasks.length > 0,
      };
    });
  }
}
