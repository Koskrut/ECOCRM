import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../../auth/auth.types";
import { ManagerDashboardService } from "../manager-dashboard.service";

function manager(): AuthUser {
  return { id: "mgr-1", email: "m@test.local", fullName: "Manager", role: UserRole.MANAGER };
}

const leadsAttention = {
  leadsWithoutTouchCount: 5,
  neverContactedNewLeadsCount: 3,
  staleInProgressLeadsCount: 2,
  leadsWithoutOwnerCount: 0,
  leadsUnknownSourceProxyCount: 0,
  overdueLeadTasksCount: 1,
};

function buildService(overrides?: {
  taskFindMany?: () => Promise<unknown[]>;
  leadFindMany?: () => Promise<unknown[]>;
}) {
  const prisma = {
    task: { findMany: overrides?.taskFindMany ?? (async () => []) },
    lead: { findMany: overrides?.leadFindMany ?? (async () => []) },
  };
  const scopeService = {
    resolveDashboardScope: async (actor: AuthUser) => ({
      orderScope: { actor, managerId: actor.id },
      allowedAssigneeIds: [actor.id],
    }),
  };
  const overviewService = {
    getOverview: async () => ({
      currency: "USD",
      data: {
        kpi: {
          bookedRevenue: 1200,
          collectedPayments: 800,
          ordersCount: 4,
          avgCheck: 300,
          debtTotal: 0,
          overdueDebt: 0,
          leadConversionProxy: 0,
          leadsCreatedCount: 8,
        },
        attention: {
          crm: { overdueTasksCount: 2, stuckOrdersCount: 0, leadsWithoutTouchCount: 5 },
          finance: { overdueOrdersCount: 1, overdueDebtAmount: 0 },
        },
      },
    }),
  };
  const leadsService = {
    getLeads: async () => ({
      data: {
        kpi: {
          leadsCreated: 8,
          won: 3,
          lost: 1,
          inProgress: 4,
          wonShareProxy: 37.5,
          exactConversionRate: 25,
        },
        charts: {
          byStatus: [
            { status: "NEW", count: 2 },
            { status: "IN_PROGRESS", count: 5 },
            { status: "WON", count: 3 },
            { status: "LOST", count: 1 },
          ],
          bySource: [],
        },
        attention: leadsAttention,
      },
    }),
  };
  const qualityService = {
    getQuality: async () => ({
      visits: { totalDone: 6 },
      calls: { inbound: 4, outbound: 10 },
    }),
  };
  const workQueue = {
    getWorkQueueSummary: async () => ({
      totalInQueue: 12,
      buckets: {
        overdueFollowup: 4,
        newNoFirstContact: 2,
        dormantReturn: 0,
        atRisk: 0,
        debtControl: 1,
      },
    }),
  };
  const dashboard = {
    getDailyTeamActivity: async () => ({
      date: "2026-07-03",
      currency: "USD",
      rows: [
        {
          userId: "mgr-1",
          fullName: "Manager",
          callsInbound: 1,
          callsOutbound: 3,
          visits: 2,
          ordersCount: 1,
          ordersAmount: 300,
          paymentsAmount: 200,
          dayPlanPercent: 70,
          dayPlanStatus: "yellow" as const,
        },
      ],
    }),
  };

  return new ManagerDashboardService(
    prisma as never,
    scopeService as never,
    overviewService as never,
    leadsService as never,
    qualityService as never,
    workQueue as never,
    dashboard as never,
  );
}

test("ManagerDashboardService.getInbox aggregates tiles from leads, work queue and overview", async () => {
  const service = buildService();
  const result = await service.getInbox(manager(), { period: "week" });

  assert.equal(result.tiles.leadsWithoutTouch, 5);
  assert.equal(result.tiles.neverContactedNewLeads, 3);
  assert.equal(result.tiles.staleInProgressLeads, 2);
  assert.equal(result.tiles.overdueFollowupContacts, 4);
  assert.equal(result.tiles.newNoFirstContactContacts, 2);
  assert.equal(result.tiles.overdueTasks, 2);
  assert.equal(result.tiles.overduePayments, 1);
  assert.equal(result.tiles.debtControlContacts, 1);
  assert.equal(result.totalInQueue, 12);
  assert.deepEqual(result.pipelineCounts, { NEW: 2, IN_PROGRESS: 5, WON: 3, LOST: 1 });
});

test("ManagerDashboardService.getInbox buckets tasks into overdue/today/tomorrow", async () => {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const overdueDue = new Date(startOfToday.getTime() - 86400000);
  const todayDue = new Date(startOfToday.getTime() + 3600000);
  const tomorrowDue = new Date(startOfToday.getTime() + 86400000 + 3600000);

  const service = buildService({
    taskFindMany: async () => [
      { id: "t1", title: "Overdue", dueAt: overdueDue, status: "OPEN", leadId: "l1", contactId: null, assignee: { fullName: "Manager" } },
      { id: "t2", title: "Today", dueAt: todayDue, status: "OPEN", leadId: null, contactId: "c1", assignee: { fullName: "Manager" } },
      { id: "t3", title: "Tomorrow", dueAt: tomorrowDue, status: "IN_PROGRESS", leadId: null, contactId: null, assignee: null },
    ],
  });

  const result = await service.getInbox(manager());
  assert.equal(result.tasks.overdue.length, 1);
  assert.equal(result.tasks.overdue[0].id, "t1");
  assert.equal(result.tasks.today.length, 1);
  assert.equal(result.tasks.today[0].id, "t2");
  assert.equal(result.tasks.tomorrow.length, 1);
  assert.equal(result.tasks.tomorrow[0].id, "t3");
});

test("ManagerDashboardService.getInbox maps hot leads with days since activity", async () => {
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 86400000);
  const service = buildService({
    leadFindMany: async () => [
      {
        id: "lead-1",
        name: null,
        firstName: "Ivan",
        lastName: "Petrov",
        middleName: null,
        fullName: null,
        companyName: null,
        source: "META",
        createdAt: threeDaysAgo,
        lastActivityAt: threeDaysAgo,
        tasks: [{ id: "task-1" }],
      },
    ],
  });

  const result = await service.getInbox(manager());
  assert.equal(result.hotLeads.length, 1);
  assert.equal(result.hotLeads[0].name, "Petrov Ivan");
  assert.equal(result.hotLeads[0].source, "META");
  assert.equal(result.hotLeads[0].hasOverdueTask, true);
  assert.equal(result.hotLeads[0].daysSinceActivity, 3);
});

test("ManagerDashboardService.getScorecard returns activity, outcomes and compare deltas", async () => {
  const service = buildService();
  const result = await service.getScorecard(manager(), { period: "week", compare: true });

  assert.equal(result.activity.today.callsOutbound, 3);
  assert.equal(result.activity.period.callsInbound, 4);
  assert.equal(result.activity.period.callsOutbound, 10);
  assert.equal(result.activity.period.visits, 6);
  assert.equal(result.activity.period.ordersCount, 4);
  assert.equal(result.outcomes.leadsCreated, 8);
  assert.equal(result.outcomes.leadsWon, 3);
  assert.equal(result.outcomes.wonShare, 37.5);
  assert.equal(result.outcomes.exactConversion, 25);
  assert.equal(result.outcomes.bookedRevenue, 1200);
  assert.equal(result.outcomes.collectedPayments, 800);
  assert.equal(result.outcomes.activeClientsInQueue, 12);
  assert.ok(result.comparePeriod);
});
