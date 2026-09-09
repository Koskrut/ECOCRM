/* eslint-disable @typescript-eslint/consistent-type-imports -- Nest DI tokens must be value imports */
import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types";
import { AnalyticsScopeService } from "../analytics/analytics-scope.service";
import { AnalyticsLeadsService } from "../analytics/services/analytics-leads.service";
import { AnalyticsOverviewService } from "../analytics/services/analytics-overview.service";
import { AnalyticsQualityService } from "../analytics/services/analytics-quality.service";
import { ANALYTICS_EXCLUDED_ORDER_STAGES } from "../analytics/analytics.constants";
import {
  previousPeriodOfSameLength,
  resolvePresetPeriod,
  type ResolvedPeriod,
} from "../analytics/utils/analytics-date.util";
import { paymentToBase, safeNum, toBaseCurrency } from "../analytics/utils/analytics-currency.util";
import { usdToBase } from "../common/currency.util";
import { ContactsWorkQueueService } from "../contacts/contacts-work-queue.service";
import { todayYmdKyiv } from "../crm-timezone";
import { buildLeadAttentionWhere } from "../leads/leads-attention.util";
import { buildOrderOverduePaymentsWhere } from "../orders/orders-attention.util";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService, type ExchangeRates } from "../settings/settings.service";
import { buildTaskOverdueWhere, startOfTodayKyiv } from "../tasks/tasks-attention.util";
import { DashboardService } from "./dashboard.service";
import {
  buildGrowthLevers,
  clientKeyFromIds,
  coveragePercent,
  enumerateKyivDays,
  forecastFromPace,
  kyivYmdOrNull,
  resolveManagerCalendarWindows,
} from "./manager-calendar.util";
import type {
  ManagerActivityMetrics,
  ManagerGrowthLever,
  ManagerHotLead,
  ManagerInboxResponse,
  ManagerInboxTask,
  ManagerInboxTasks,
  ManagerMonthPulse,
  ManagerPipelineCounts,
  ManagerPotential,
  ManagerScorecardResponse,
  ManagerTrend,
  ManagerTrendPoint,
} from "./manager-dashboard.types";

const OPEN_PIPELINE_STAGES = [
  "NEW",
  "AWAITING_PAYMENT",
  "AWAITING_STOCK",
  "CONFIRMED",
  "READY_TO_SHIP",
] as const;

const LEGACY_SHIPPED_STATUSES = ["IN_TRANSIT", "DELIVERED"] as const;

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

function periodIso(period: ResolvedPeriod): { from: string; to: string } {
  return { from: period.from.toISOString(), to: period.to.toISOString() };
}

type ShippedClientIndex = {
  clients: Set<string>;
  byDay: Map<string, Set<string>>;
};

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
    private readonly settings: SettingsService,
  ) {}

  async getInbox(actor: AuthUser, _opts?: { period?: string }): Promise<ManagerInboxResponse> {
    // Inbox is a now-snapshot: rolling 7/30 activity period must not hide old open leads.
    void _opts;
    const now = new Date();

    const [diagnostics, summary, tasks, hotLeads, overdueTasks, overduePayments] =
      await Promise.all([
        this.loadSnapshotLeadDiagnostics(actor.id, now),
        this.workQueue.getWorkQueueSummary({}, actor),
        this.loadGroupedTasks(actor.id, now),
        this.loadHotLeads(actor.id, now),
        this.prisma.task.count({
          where: buildTaskOverdueWhere({
            managerId: actor.id,
            allowedAssigneeIds: [actor.id],
          }),
        }),
        this.prisma.order.count({
          where: buildOrderOverduePaymentsWhere({ managerId: actor.id }, now),
        }),
      ]);

    return {
      tiles: {
        leadsWithoutTouch: diagnostics.leadsWithoutTouch,
        neverContactedNewLeads: diagnostics.neverContactedNewLeads,
        staleInProgressLeads: diagnostics.staleInProgressLeads,
        overdueFollowupContacts: summary.buckets.overdueFollowup,
        newNoFirstContactContacts: summary.buckets.newNoFirstContact,
        overdueTasks,
        overduePayments,
        debtControlContacts: summary.buckets.debtControl,
      },
      tasks,
      pipelineCounts: diagnostics.pipelineCounts,
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
    const windows = resolveManagerCalendarWindows();

    const comparePeriod = compare ? previousPeriodOfSameLength(period.from, period.to) : undefined;

    const ownedIds = await this.loadOwnedClientIds(actor.id);
    const clientBase = ownedIds.size;
    const rates = await this.settings.getExchangeRates();

    const [
      overview,
      leads,
      quality,
      todayActivity,
      summary,
      compareQuality,
      shippedCurrentIdx,
      shippedPriorFullIdx,
      shippedPriorPaceIdx,
      monthOverview,
      priorPaceOverview,
      priorFullOverview,
      monthLeads,
      priorPaceLeads,
      overdueTasksNow,
      potential,
    ] = await Promise.all([
      this.overviewService.getOverview(period, scope, { compare }),
      this.leadsService.getLeads(period, scope, { compare }),
      this.qualityService.getQuality(period, scope),
      this.dashboard.getDailyTeamActivity(today, actor),
      this.workQueue.getWorkQueueSummary({}, actor),
      comparePeriod ? this.qualityService.getQuality(comparePeriod, scope) : Promise.resolve(null),
      this.collectShippedClients(actor.id, windows.currentMonthToDate, ownedIds),
      this.collectShippedClients(actor.id, windows.previousMonthFull, ownedIds),
      this.collectShippedClients(actor.id, windows.previousMonthPace, ownedIds),
      this.overviewService.getOverview(windows.currentMonthToDate, scope),
      this.overviewService.getOverview(windows.previousMonthPace, scope),
      this.overviewService.getOverview(windows.previousMonthFull, scope),
      this.leadsService.getLeads(windows.currentMonthToDate, scope),
      this.leadsService.getLeads(windows.previousMonthPace, scope),
      this.prisma.task.count({
        where: buildTaskOverdueWhere({ managerId: actor.id, allowedAssigneeIds: [actor.id] }),
      }),
      this.buildPotential(actor.id, rates),
    ]);

    const [trendCurrent, trendPrevious] = await Promise.all([
      this.buildTrendPoints(
        actor.id,
        windows.currentMonthToDate,
        ownedIds,
        rates,
        shippedCurrentIdx.byDay,
      ),
      this.buildTrendPoints(
        actor.id,
        windows.previousMonthFull,
        ownedIds,
        rates,
        shippedPriorFullIdx.byDay,
      ),
    ]);
    const trend: ManagerTrend = { current: trendCurrent, previousMonth: trendPrevious };

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

    const monthKpi = monthOverview.data.kpi;
    const paceKpi = priorPaceOverview.data.kpi;
    const fullKpi = priorFullOverview.data.kpi;
    const monthLeadKpi = monthLeads.data.kpi;
    const paceLeadKpi = priorPaceLeads.data.kpi;

    const shippedCurrent = shippedCurrentIdx.clients.size;
    const shippedPriorFull = shippedPriorFullIdx.clients.size;
    const shippedPriorPace = shippedPriorPaceIdx.clients.size;
    const coveragePct = coveragePercent(shippedCurrent, clientBase);
    const coveragePctPace = coveragePercent(shippedPriorPace, clientBase);
    const unshippedClients = Math.max(0, clientBase - shippedCurrent);

    // Snapshot-now overdue payments (attention block is period-independent in overview).
    const overduePaymentsNow = monthOverview.data.attention.finance.overdueOrdersCount;

    const monthPulse: ManagerMonthPulse = {
      period: periodIso(windows.currentMonthToDate),
      previousMonthFull: periodIso(windows.previousMonthFull),
      previousMonthPace: periodIso(windows.previousMonthPace),
      daysElapsed: windows.daysElapsed,
      daysInMonth: windows.daysInMonth,
      daysRemaining: windows.daysRemaining,
      coverage: {
        shippedClients: shippedCurrent,
        clientBase,
        coveragePercent: coveragePct,
        unshippedClients,
        previousMonthFull: shippedPriorFull,
        previousMonthPace: shippedPriorPace,
      },
      money: {
        bookedRevenue: monthKpi.bookedRevenue,
        collectedPayments: monthKpi.collectedPayments,
        ordersCount: monthKpi.ordersCount,
        avgCheck: monthKpi.avgCheck,
        forecastBookedRevenue: forecastFromPace(
          monthKpi.bookedRevenue,
          windows.daysElapsed,
          windows.daysInMonth,
        ),
        previousMonthFull: {
          bookedRevenue: fullKpi.bookedRevenue,
          collectedPayments: fullKpi.collectedPayments,
          ordersCount: fullKpi.ordersCount,
          avgCheck: fullKpi.avgCheck,
        },
        previousMonthPace: {
          bookedRevenue: paceKpi.bookedRevenue,
          collectedPayments: paceKpi.collectedPayments,
          ordersCount: paceKpi.ordersCount,
          avgCheck: paceKpi.avgCheck,
        },
      },
      conversion: {
        exactConversion: monthLeadKpi.exactConversionRate ?? null,
        wonShare: monthLeadKpi.wonShareProxy,
        leadsCreated: monthLeadKpi.leadsCreated,
        leadsWon: monthLeadKpi.won,
        previousMonthPace: {
          exactConversion: paceLeadKpi.exactConversionRate ?? null,
          wonShare: paceLeadKpi.wonShareProxy,
          leadsCreated: paceLeadKpi.leadsCreated,
          leadsWon: paceLeadKpi.won,
        },
      },
    };

    const growthLevers: ManagerGrowthLever[] = buildGrowthLevers({
      coveragePct,
      coveragePctPace,
      conversionPct: monthLeadKpi.exactConversionRate ?? null,
      conversionPctPrior: paceLeadKpi.exactConversionRate ?? null,
      avgCheck: monthKpi.avgCheck,
      avgCheckPrior: paceKpi.avgCheck,
      overduePayments: overduePaymentsNow,
      overdueFollowups: summary.buckets.overdueFollowup,
      overdueTasks: overdueTasksNow,
      unshippedBase: unshippedClients,
    });

    potential.unshippedClients = unshippedClients;
    potential.overdueFollowupContacts = summary.buckets.overdueFollowup;

    return {
      currency: overview.currency,
      period: periodIso(period),
      comparePeriod: comparePeriod ? periodIso(comparePeriod) : undefined,
      activity: {
        today: todayMetrics,
        period: periodMetrics,
        compare: compareMetrics,
      },
      outcomes,
      monthPulse,
      growthLevers,
      trend,
      potential,
    };
  }

  private async loadSnapshotLeadDiagnostics(
    managerId: string,
    now: Date,
  ): Promise<{
    leadsWithoutTouch: number;
    neverContactedNewLeads: number;
    staleInProgressLeads: number;
    pipelineCounts: ManagerPipelineCounts;
  }> {
    const owner = { ownerId: managerId };
    const [neverContactedNewLeads, staleInProgressLeads, leadsWithoutTouch, byStatus] =
      await Promise.all([
        this.prisma.lead.count({
          where: { ...owner, ...buildLeadAttentionWhere("never-contacted-new", now) },
        }),
        this.prisma.lead.count({
          where: { ...owner, ...buildLeadAttentionWhere("stale-in-progress", now) },
        }),
        this.prisma.lead.count({
          where: { ...owner, ...buildLeadAttentionWhere("without-touch", now) },
        }),
        this.prisma.lead.groupBy({
          by: ["status"],
          where: owner,
          _count: { id: true },
        }),
      ]);

    return {
      neverContactedNewLeads,
      staleInProgressLeads,
      leadsWithoutTouch,
      pipelineCounts: this.pipelineFromStatuses(
        byStatus.map((row) => ({ status: row.status, count: row._count.id })),
      ),
    };
  }

  private async loadOwnedClientIds(managerId: string): Promise<Set<string>> {
    const owned = await this.prisma.contact.findMany({
      where: { ownerId: managerId },
      select: { id: true },
    });
    return new Set(owned.map((c) => c.id));
  }

  /**
   * Unique owned clients with a SHIPPED event in the window.
   * Primary: OrderStatusHistory → SHIPPED.
   * Legacy fallback: IN_TRANSIT/DELIVERED shipments only for clients missing from history.
   */
  private async collectShippedClients(
    managerId: string,
    period: ResolvedPeriod,
    ownedSet: Set<string>,
  ): Promise<ShippedClientIndex> {
    const clients = new Set<string>();
    const byDay = new Map<string, Set<string>>();

    const add = (key: string, at: Date) => {
      if (!ownedSet.has(key)) return;
      clients.add(key);
      const ymd = kyivYmdOrNull(at);
      if (!ymd) return;
      let set = byDay.get(ymd);
      if (!set) {
        set = new Set();
        byDay.set(ymd, set);
      }
      set.add(key);
    };

    if (ownedSet.size === 0) return { clients, byDay };

    const historyRows = await this.prisma.orderStatusHistory.findMany({
      where: {
        toOrderStage: "SHIPPED",
        createdAt: { gte: period.from, lte: period.to },
        order: { ownerId: managerId },
      },
      select: {
        createdAt: true,
        order: { select: { clientId: true, contactId: true } },
      },
    });

    for (const row of historyRows) {
      const key = clientKeyFromIds(row.order.clientId, row.order.contactId);
      if (key) add(key, row.createdAt);
    }

    const shipmentRows = await this.prisma.shipment.findMany({
      where: {
        createdAt: { gte: period.from, lte: period.to },
        status: { in: [...LEGACY_SHIPPED_STATUSES] },
        order: { ownerId: managerId },
      },
      select: {
        createdAt: true,
        contactId: true,
        order: { select: { clientId: true, contactId: true } },
      },
    });
    for (const row of shipmentRows) {
      const key = clientKeyFromIds(row.order.clientId, row.contactId ?? row.order.contactId);
      // Only backfill clients that never appeared in SHIPPED history for this window.
      if (key && !clients.has(key)) add(key, row.createdAt);
    }

    return { clients, byDay };
  }

  private async buildTrendPoints(
    managerId: string,
    period: ResolvedPeriod,
    ownedSet: Set<string>,
    rates: ExchangeRates,
    shippedByDay: Map<string, Set<string>>,
  ): Promise<ManagerTrendPoint[]> {
    const [orders, payments] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          ownerId: managerId,
          createdAt: { gte: period.from, lte: period.to },
          OR: [
            { orderStage: { notIn: [...ANALYTICS_EXCLUDED_ORDER_STAGES] } },
            { orderStage: null },
          ],
        },
        select: {
          createdAt: true,
          totalAmount: true,
          returnAdjustmentAmount: true,
          currency: true,
        },
      }),
      this.prisma.payment.findMany({
        where: {
          status: "COMPLETED",
          paidAt: { gte: period.from, lte: period.to },
          order: { ownerId: managerId },
        },
        select: { paidAt: true, amount: true, amountUsd: true, currency: true },
      }),
    ]);

    const byDay = new Map<string, ManagerTrendPoint>();
    for (const ymd of enumerateKyivDays(period)) {
      byDay.set(ymd, {
        date: ymd,
        bookedRevenue: 0,
        collectedPayments: 0,
        shippedClients: shippedByDay.get(ymd)?.size ?? 0,
      });
    }

    // Defensive: keep owned filter semantics even if shippedByDay came from elsewhere.
    void ownedSet;

    for (const o of orders) {
      const ymd = kyivYmdOrNull(o.createdAt);
      if (!ymd) continue;
      const point = byDay.get(ymd);
      if (!point) continue;
      const cur = (o.currency || "USD").trim().toUpperCase();
      point.bookedRevenue += toBaseCurrency(
        Math.max(0, safeNum(o.totalAmount) - safeNum(o.returnAdjustmentAmount)),
        cur,
        rates,
      );
    }

    for (const p of payments) {
      const ymd = kyivYmdOrNull(p.paidAt);
      if (!ymd) continue;
      const point = byDay.get(ymd);
      if (!point) continue;
      point.collectedPayments += paymentToBase(p.amountUsd, p.amount, p.currency, rates);
    }

    return [...byDay.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((p) => ({
        ...p,
        bookedRevenue: Math.round(p.bookedRevenue * 100) / 100,
        collectedPayments: Math.round(p.collectedPayments * 100) / 100,
      }));
  }

  private async buildPotential(managerId: string, rates: ExchangeRates): Promise<ManagerPotential> {
    const [hotLeads, openOrders, byStage] = await Promise.all([
      this.prisma.lead.count({
        where: { ownerId: managerId, status: "IN_PROGRESS" },
      }),
      this.prisma.order.findMany({
        where: {
          ownerId: managerId,
          orderStage: { in: [...OPEN_PIPELINE_STAGES] },
        },
        select: { debtAmount: true, orderStage: true },
      }),
      this.prisma.order.groupBy({
        by: ["orderStage"],
        where: {
          ownerId: managerId,
          orderStage: { in: [...OPEN_PIPELINE_STAGES] },
        },
        _count: { id: true },
      }),
    ]);

    // Order.debtAmount is stored in USD; convert to desk base currency.
    let openPipelineAmountUsd = 0;
    for (const o of openOrders) {
      openPipelineAmountUsd += Math.max(0, safeNum(o.debtAmount));
    }
    const openPipelineAmount = Math.round(usdToBase(openPipelineAmountUsd, rates) * 100) / 100;

    return {
      unshippedClients: 0,
      overdueFollowupContacts: 0,
      hotLeadsCount: hotLeads,
      openPipelineOrders: openOrders.length,
      openPipelineAmount,
      pipelineByStage: byStage
        .map((r) => ({ stage: r.orderStage ?? "UNKNOWN", count: r._count.id }))
        .sort((a, b) => b.count - a.count),
    };
  }

  private pipelineFromStatuses(rows: { status: string; count: number }[]): ManagerPipelineCounts {
    const counts: ManagerPipelineCounts = { NEW: 0, IN_PROGRESS: 0, WON: 0, LOST: 0 };
    for (const row of rows) {
      if (row.status in counts) {
        counts[row.status as keyof ManagerPipelineCounts] = row.count;
      }
    }
    return counts;
  }

  private async loadGroupedTasks(assigneeId: string, now: Date): Promise<ManagerInboxTasks> {
    const startOfToday = startOfTodayKyiv(now);
    const startOfTomorrow = new Date(startOfToday.getTime() + 86400000);
    const endOfTomorrow = new Date(startOfTomorrow.getTime() + 86400000);

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
