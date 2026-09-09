import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../../auth/auth.types";
import { startOfTodayKyiv } from "../../tasks/tasks-attention.util";
import { ManagerDashboardService } from "../manager-dashboard.service";

function manager(): AuthUser {
  return { id: "mgr-1", email: "m@test.local", fullName: "Manager", role: UserRole.MANAGER };
}

function overviewPayload(overrides?: Partial<{
  bookedRevenue: number;
  collectedPayments: number;
  ordersCount: number;
  avgCheck: number;
  overdueTasksCount: number;
  overdueOrdersCount: number;
}>) {
  return {
    currency: "USD",
    data: {
      kpi: {
        bookedRevenue: overrides?.bookedRevenue ?? 1200,
        collectedPayments: overrides?.collectedPayments ?? 800,
        ordersCount: overrides?.ordersCount ?? 4,
        avgCheck: overrides?.avgCheck ?? 300,
        debtTotal: 0,
        overdueDebt: 0,
        leadConversionProxy: 0,
        leadsCreatedCount: 8,
      },
      attention: {
        crm: {
          overdueTasksCount: overrides?.overdueTasksCount ?? 2,
          stuckOrdersCount: 0,
          leadsWithoutTouchCount: 5,
        },
        finance: {
          overdueOrdersCount: overrides?.overdueOrdersCount ?? 1,
          overdueDebtAmount: 0,
        },
      },
    },
    compare: {
      kpi: {
        bookedRevenue: 1000,
        collectedPayments: 700,
        ordersCount: 3,
        avgCheck: 280,
        debtTotal: 0,
        overdueDebt: 0,
        leadConversionProxy: 0,
        leadsCreatedCount: 6,
      },
    },
  };
}

function leadsPayload() {
  return {
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
      attention: {
        leadsWithoutTouchCount: 5,
        neverContactedNewLeadsCount: 3,
        staleInProgressLeadsCount: 2,
        leadsWithoutOwnerCount: 0,
        leadsUnknownSourceProxyCount: 0,
        overdueLeadTasksCount: 1,
      },
    },
    compare: {
      kpi: {
        leadsCreated: 6,
        won: 2,
        lost: 1,
        inProgress: 3,
        wonShareProxy: 30,
        exactConversionRate: 20,
      },
    },
  };
}

function buildService(overrides?: {
  taskFindMany?: () => Promise<unknown[]>;
  taskCount?: () => Promise<number>;
  leadFindMany?: () => Promise<unknown[]>;
  leadCount?: (args?: { where?: unknown }) => Promise<number>;
  leadGroupBy?: () => Promise<unknown[]>;
  contactFindMany?: () => Promise<{ id: string }[]>;
  historyFindMany?: () => Promise<unknown[]>;
  shipmentFindMany?: () => Promise<unknown[]>;
  orderFindMany?: (args?: { where?: unknown }) => Promise<unknown[]>;
  orderCount?: () => Promise<number>;
  orderGroupBy?: () => Promise<unknown[]>;
  paymentFindMany?: (args?: { where?: unknown }) => Promise<unknown[]>;
  rates?: { baseCurrency: "USD" | "EUR"; UAH_TO_USD: number; EUR_TO_USD: number };
}) {
  let leadCountCall = 0;
  const prisma = {
    task: {
      findMany: overrides?.taskFindMany ?? (async () => []),
      count: overrides?.taskCount ?? (async () => 2),
    },
    lead: {
      findMany: overrides?.leadFindMany ?? (async () => []),
      groupBy:
        overrides?.leadGroupBy ??
        (async () => [
          { status: "NEW", _count: { id: 2 } },
          { status: "IN_PROGRESS", _count: { id: 5 } },
          { status: "WON", _count: { id: 3 } },
          { status: "LOST", _count: { id: 1 } },
        ]),
      count:
        overrides?.leadCount ??
        (async () => {
          // neverContacted, staleIp, withoutTouch in that order from loadSnapshotLeadDiagnostics
          const seq = [3, 2, 5];
          const value = seq[Math.min(leadCountCall, seq.length - 1)] ?? 0;
          leadCountCall += 1;
          return value;
        }),
    },
    contact: {
      findMany:
        overrides?.contactFindMany ??
        (async () => [{ id: "c1" }, { id: "c2" }, { id: "c3" }, { id: "c4" }, { id: "c5" }]),
    },
    orderStatusHistory: {
      findMany:
        overrides?.historyFindMany ??
        (async () => [
          {
            createdAt: new Date("2026-09-02T10:00:00Z"),
            order: { clientId: "c1", contactId: null },
          },
          {
            createdAt: new Date("2026-09-03T10:00:00Z"),
            order: { clientId: "c1", contactId: null },
          },
          {
            createdAt: new Date("2026-09-04T10:00:00Z"),
            order: { clientId: "c2", contactId: null },
          },
          {
            createdAt: new Date("2026-09-05T10:00:00Z"),
            order: { clientId: "other", contactId: null },
          },
        ]),
    },
    shipment: {
      findMany:
        overrides?.shipmentFindMany ??
        (async () => [
          {
            contactId: "c3",
            createdAt: new Date("2026-09-06T10:00:00Z"),
            order: { clientId: null, contactId: "c3" },
          },
        ]),
    },
    order: {
      findMany:
        overrides?.orderFindMany ??
        (async () => [
          {
            createdAt: new Date("2026-09-02T12:00:00Z"),
            totalAmount: 100,
            returnAdjustmentAmount: 0,
            currency: "USD",
            clientId: "c1",
            contactId: null,
            orderStage: "READY_TO_SHIP",
            debtAmount: 40,
          },
        ]),
      count: overrides?.orderCount ?? (async () => 7),
      groupBy:
        overrides?.orderGroupBy ??
        (async () => [{ orderStage: "READY_TO_SHIP", _count: { id: 1 } }]),
    },
    payment: {
      findMany:
        overrides?.paymentFindMany ??
        (async () => [
          {
            paidAt: new Date("2026-09-02T15:00:00Z"),
            amount: 50,
            amountUsd: 50,
            currency: "USD",
          },
        ]),
    },
  };
  const scopeService = {
    resolveDashboardScope: async (actor: AuthUser) => ({
      orderScope: { actor, managerId: actor.id },
      allowedAssigneeIds: [actor.id],
    }),
  };
  const overviewService = {
    getOverview: async () => overviewPayload({ overdueOrdersCount: 7 }),
  };
  const leadsService = {
    getLeads: async () => leadsPayload(),
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
  const settings = {
    getExchangeRates: async () =>
      overrides?.rates ?? {
        baseCurrency: "USD" as const,
        UAH_TO_USD: 0.024,
        EUR_TO_USD: 1.1,
      },
  };

  return new ManagerDashboardService(
    prisma as never,
    scopeService as never,
    overviewService as never,
    leadsService as never,
    qualityService as never,
    workQueue as never,
    dashboard as never,
    settings as never,
  );
}

test("ManagerDashboardService.getInbox uses snapshot lead diagnostics independent of period", async () => {
  const service = buildService();
  const result = await service.getInbox(manager(), { period: "week" });

  assert.equal(result.tiles.leadsWithoutTouch, 5);
  assert.equal(result.tiles.neverContactedNewLeads, 3);
  assert.equal(result.tiles.staleInProgressLeads, 2);
  assert.equal(result.tiles.overdueFollowupContacts, 4);
  assert.equal(result.tiles.newNoFirstContactContacts, 2);
  assert.equal(result.tiles.overdueTasks, 2);
  assert.equal(result.tiles.overduePayments, 7);
  assert.equal(result.tiles.debtControlContacts, 1);
  assert.equal(result.totalInQueue, 12);
  assert.deepEqual(result.pipelineCounts, { NEW: 2, IN_PROGRESS: 5, WON: 3, LOST: 1 });
});

test("ManagerDashboardService.getInbox keeps old IN_PROGRESS leads in pipeline", async () => {
  const service = buildService({
    leadGroupBy: async () => [
      { status: "NEW", _count: { id: 0 } },
      { status: "IN_PROGRESS", _count: { id: 1 } },
      { status: "WON", _count: { id: 0 } },
      { status: "LOST", _count: { id: 0 } },
    ],
    leadCount: async () => 1,
  });
  const result = await service.getInbox(manager(), { period: "week" });
  assert.equal(result.pipelineCounts.IN_PROGRESS, 1);
  assert.equal(result.tiles.staleInProgressLeads, 1);
});

test("ManagerDashboardService.getInbox buckets tasks with Kyiv day bounds", async () => {
  const startOfToday = startOfTodayKyiv();
  const overdueDue = new Date(startOfToday.getTime() - 3600000);
  const todayDue = new Date(startOfToday.getTime() + 3600000);
  const tomorrowDue = new Date(startOfToday.getTime() + 86400000 + 3600000);

  const service = buildService({
    taskFindMany: async () => [
      {
        id: "t1",
        title: "Overdue",
        dueAt: overdueDue,
        status: "OPEN",
        leadId: "l1",
        contactId: null,
        assignee: { fullName: "Manager" },
      },
      {
        id: "t2",
        title: "Today",
        dueAt: todayDue,
        status: "OPEN",
        leadId: null,
        contactId: "c1",
        assignee: { fullName: "Manager" },
      },
      {
        id: "t3",
        title: "Tomorrow",
        dueAt: tomorrowDue,
        status: "IN_PROGRESS",
        leadId: null,
        contactId: null,
        assignee: null,
      },
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

test("ManagerDashboardService.getScorecard returns activity, outcomes and month pulse", async () => {
  const service = buildService({
    shipmentFindMany: async () => [
      {
        contactId: "c3",
        createdAt: new Date("2026-09-06T10:00:00Z"),
        order: { clientId: null, contactId: "c3" },
      },
    ],
  });
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

  assert.equal(result.monthPulse.coverage.clientBase, 5);
  assert.equal(result.monthPulse.coverage.shippedClients, 3);
  assert.equal(result.monthPulse.coverage.unshippedClients, 2);
  assert.equal(result.monthPulse.coverage.coveragePercent, 60);
  assert.ok(result.monthPulse.money.forecastBookedRevenue != null);
  assert.ok(result.growthLevers.length >= 1);
  assert.ok(result.growthLevers.some((l) => l.key === "overdue"));
  assert.ok(result.growthLevers.some((l) => l.key === "collection" && l.currentValue === 7));
  assert.ok(Array.isArray(result.trend.current));
  assert.ok(result.trend.current.length >= 1);
  assert.equal(result.potential.unshippedClients, 2);
  assert.equal(result.potential.overdueFollowupContacts, 4);
  assert.equal(result.potential.openPipelineOrders, 1);
  assert.equal(result.potential.openPipelineAmount, 40);
});

test("ManagerDashboardService.getScorecard converts USD debt to EUR base currency", async () => {
  const service = buildService({
    rates: { baseCurrency: "EUR", UAH_TO_USD: 0.024, EUR_TO_USD: 1.1 },
    orderFindMany: async () => [
      {
        createdAt: new Date("2026-09-02T12:00:00Z"),
        totalAmount: 100,
        returnAdjustmentAmount: 0,
        currency: "USD",
        orderStage: "READY_TO_SHIP",
        debtAmount: 110,
      },
    ],
  });
  const result = await service.getScorecard(manager(), { period: "month" });
  // 110 USD / 1.1 = 100 EUR
  assert.equal(result.potential.openPipelineAmount, 100);
});

test("ManagerDashboardService trend filters include null orderStage and COMPLETED payments only", async () => {
  const captured: { orderWhere?: unknown; paymentWhere?: unknown } = {};
  const service = buildService({
    orderFindMany: async (args) => {
      captured.orderWhere = args?.where;
      return [
        {
          createdAt: new Date("2026-09-02T12:00:00Z"),
          totalAmount: 100,
          returnAdjustmentAmount: 0,
          currency: "USD",
          orderStage: null,
          debtAmount: 0,
        },
      ];
    },
    paymentFindMany: async (args) => {
      captured.paymentWhere = args?.where;
      return [
        {
          paidAt: new Date("2026-09-02T15:00:00Z"),
          amount: 50,
          amountUsd: 50,
          currency: "USD",
        },
      ];
    },
  });
  await service.getScorecard(manager(), { period: "month" });
  const orderWhere = captured.orderWhere as { OR?: unknown[] };
  assert.ok(Array.isArray(orderWhere.OR));
  const paymentWhere = captured.paymentWhere as { status?: string };
  assert.equal(paymentWhere.status, "COMPLETED");
});

test("ManagerDashboardService.getScorecard ignores READY legacy shipments", async () => {
  const service = buildService({
    contactFindMany: async () => [{ id: "only-mine" }, { id: "ready-only" }],
    historyFindMany: async () => [
      { createdAt: new Date(), order: { clientId: "only-mine", contactId: null } },
    ],
    shipmentFindMany: async () => [],
  });
  const result = await service.getScorecard(manager(), { period: "month" });
  assert.equal(result.monthPulse.coverage.clientBase, 2);
  assert.equal(result.monthPulse.coverage.shippedClients, 1);
  assert.equal(result.monthPulse.coverage.unshippedClients, 1);
});

test("ManagerDashboardService.getScorecard ignores foreign clients and dedupes shipments", async () => {
  const service = buildService({
    contactFindMany: async () => [{ id: "only-mine" }],
    historyFindMany: async () => [
      { createdAt: new Date(), order: { clientId: "only-mine", contactId: null } },
      { createdAt: new Date(), order: { clientId: "only-mine", contactId: null } },
      { createdAt: new Date(), order: { clientId: "not-mine", contactId: null } },
    ],
    shipmentFindMany: async () => [],
  });
  const result = await service.getScorecard(manager(), { period: "month" });
  assert.equal(result.monthPulse.coverage.clientBase, 1);
  assert.equal(result.monthPulse.coverage.shippedClients, 1);
  assert.equal(result.monthPulse.coverage.unshippedClients, 0);
});
