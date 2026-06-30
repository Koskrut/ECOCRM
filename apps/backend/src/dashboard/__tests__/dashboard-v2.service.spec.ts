import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../../auth/auth.types";
import { DashboardV2Service } from "../dashboard-v2.service";

function manager(): AuthUser {
  return { id: "mgr-1", email: "m@test.local", fullName: "Manager", role: UserRole.MANAGER };
}

function lead(): AuthUser {
  return { id: "lead-1", email: "l@test.local", fullName: "Lead", role: UserRole.LEAD };
}

test("DashboardV2Service: MANAGER gets showTeamView false and self-scoped role", async () => {
  const scopeService = {
    resolveDashboardScope: async () => ({
      orderScope: { actor: manager(), managerId: "mgr-1" },
      allowedAssigneeIds: ["mgr-1"],
    }),
  };

  const overviewPayload = {
    kpi: {
      bookedRevenue: 100,
      collectedPayments: 80,
      ordersCount: 2,
      avgCheck: 50,
      debtTotal: 10,
      overdueDebt: 5,
      leadConversionProxy: 25,
      leadsCreatedCount: 4,
    },
    charts: {
      bookedRevenueByDay: [],
      collectedPaymentsByDay: [],
      ordersByStage: [],
    },
    attention: {
      crm: { overdueTasksCount: 1, stuckOrdersCount: 0, leadsWithoutTouchCount: 2 },
      finance: { overdueOrdersCount: 0, overdueDebtAmount: 0 },
    },
  };

  const service = new DashboardV2Service(
    {
      getDailyTeamActivity: async () => ({
        date: "2026-06-30",
        currency: "USD",
        rows: [
          {
            userId: "mgr-1",
            fullName: "Manager",
            callsInbound: 1,
            callsOutbound: 2,
            visits: 1,
            ordersCount: 1,
            ordersAmount: 100,
            paymentsAmount: 80,
            dayPlanPercent: 70,
            dayPlanStatus: "yellow" as const,
          },
        ],
      }),
    } as never,
    scopeService as never,
    {
      getOverview: async () => ({
        currency: "USD",
        data: overviewPayload,
        compare: undefined,
      }),
    } as never,
    {
      getLeads: async () => ({
        data: { charts: { byStatus: [], bySource: [] } },
      }),
    } as never,
    { getManagers: async () => ({ managers: [] }) } as never,
    {
      getQuality: async () => ({
        visits: {
          totalDone: 1,
          byOutcome: [],
          withoutResultNote: 0,
          withFollowUp: 0,
          gpsVerifiedStart: 0,
          gpsVerifiedComplete: 0,
        },
        dayPlanTrend: [],
        overdueFollowUps: 0,
        calls: { inbound: 1, outbound: 2 },
      }),
      getVisitsWithoutNoteForUsers: async () => new Map([["mgr-1", 0]]),
      getOverdueTasksForUsers: async () => new Map([["mgr-1", 0]]),
    } as never,
    {
      getDayPlan: async () => null,
      getOverallPercentsForUsers: async () => new Map(),
    } as never,
    { getAgenda: async () => null } as never,
    {
      task: {
        findMany: async () => [],
      },
      user: { findMany: async () => [] },
    } as never,
  );

  const result = await service.getV2(manager(), { period: "month", activityDate: "2026-06-30" });

  assert.equal(result.role, "MANAGER");
  assert.equal(result.showTeamView, false);
  assert.equal(result.managers, undefined);
  assert.equal(result.teamPulse.rows.length, 1);
  assert.equal(result.teamPulse.rows[0].userId, "mgr-1");
});

test("DashboardV2Service: LEAD gets showTeamView true and managers section", async () => {
  const scopeService = {
    resolveDashboardScope: async () => ({
      orderScope: { actor: lead(), allowedOwnerIds: ["mgr-1", "mgr-2"] },
      allowedAssigneeIds: ["mgr-1", "mgr-2"],
    }),
  };

  const overviewPayload = {
    kpi: {
      bookedRevenue: 500,
      collectedPayments: 400,
      ordersCount: 10,
      avgCheck: 50,
      debtTotal: 20,
      overdueDebt: 5,
      leadConversionProxy: 30,
      leadsCreatedCount: 8,
    },
    charts: {
      bookedRevenueByDay: [],
      collectedPaymentsByDay: [],
      ordersByStage: [],
    },
    attention: {
      crm: { overdueTasksCount: 2, stuckOrdersCount: 1, leadsWithoutTouchCount: 3 },
      finance: { overdueOrdersCount: 1, overdueDebtAmount: 100 },
    },
  };

  const service = new DashboardV2Service(
    {
      getDailyTeamActivity: async () => ({
        date: "2026-06-30",
        currency: "USD",
        rows: [
          {
            userId: "mgr-1",
            fullName: "M1",
            callsInbound: 0,
            callsOutbound: 0,
            visits: 0,
            ordersCount: 0,
            ordersAmount: 0,
            paymentsAmount: 0,
            dayPlanPercent: 50,
            dayPlanStatus: "yellow" as const,
          },
          {
            userId: "mgr-2",
            fullName: "M2",
            callsInbound: 0,
            callsOutbound: 0,
            visits: 0,
            ordersCount: 0,
            ordersAmount: 0,
            paymentsAmount: 0,
            dayPlanPercent: 90,
            dayPlanStatus: "green" as const,
          },
        ],
      }),
    } as never,
    scopeService as never,
    {
      getOverview: async () => ({
        currency: "USD",
        data: overviewPayload,
      }),
    } as never,
    {
      getLeads: async () => ({
        data: { charts: { byStatus: [], bySource: [] } },
      }),
    } as never,
    {
      getManagers: async () => ({
        managers: [
          {
            id: "mgr-1",
            name: "M1",
            bookedRevenue: 200,
            collectedPayments: 150,
            ordersCount: 4,
            avgCheck: 50,
            overdueTasks: 1,
          },
        ],
      }),
    } as never,
    {
      getQuality: async () => ({
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
      }),
      getVisitsWithoutNoteForUsers: async () => new Map(),
      getOverdueTasksForUsers: async () => new Map(),
    } as never,
    {
      getDayPlan: async () => null,
      getOverallPercentsForUsers: async () =>
        new Map([["mgr-1", { percent: 50, status: "yellow" as const }]]),
    } as never,
    { getAgenda: async () => null } as never,
    {
      task: { findMany: async () => [] },
      call: { groupBy: async () => [] },
      visit: { groupBy: async () => [] },
      user: { findMany: async () => [{ id: "mgr-1" }, { id: "mgr-2" }] },
    } as never,
  );

  const result = await service.getV2(lead(), { period: "week", activityDate: "2026-06-30" });

  assert.equal(result.role, "LEAD");
  assert.equal(result.showTeamView, true);
  assert.ok(Array.isArray(result.managers));
  assert.equal(result.managers!.length, 1);
  assert.equal(result.teamPulse.rows.length, 2);
});
