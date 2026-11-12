import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UserRole } from "@prisma/client";
import { ManagerDailyReportService } from "../manager-daily-report.service";

describe("ManagerDailyReportService.sendDailyReports", () => {
  it("skips second send for same user and day", async () => {
    const created: Array<Record<string, unknown>> = [];
    let existingCount = 0;

    const prisma = {
      user: {
        findMany: async (args: { where?: { leadId?: unknown } }) => {
          if (args.where?.leadId) return [];
          return [
            {
              id: "mgr1",
              fullName: "Менеджер",
              role: UserRole.MANAGER,
            },
          ];
        },
      },
      userNotification: {
        findFirst: async () => {
          if (existingCount > 0) return { id: "n-existing" };
          return null;
        },
      },
      call: { groupBy: async () => [] },
      visit: { findMany: async () => [] },
      order: { findMany: async () => [] },
      payment: { findMany: async () => [] },
      lead: { groupBy: async () => [] },
    };

    const settings = {
      getExchangeRates: async () => ({
        UAH_TO_USD: 0.024,
        EUR_TO_USD: 1.05,
        baseCurrency: "USD" as const,
      }),
      getTelegramDailyWorkReportConfig: async () => ({
        enabled: true,
        time: "18:00",
        weekdaysOnly: true,
        teamSummary: true,
      }),
    };

    const notifications = {
      create: async (params: Record<string, unknown>) => {
        created.push(params);
        existingCount += 1;
        return { id: `n${created.length}` };
      },
    };

    const svc = new ManagerDailyReportService(
      prisma as never,
      settings as never,
      notifications as never,
    );

    const first = await svc.sendDailyReports("2026-11-12");
    const second = await svc.sendDailyReports("2026-11-12");

    assert.equal(first.sent, 1);
    assert.equal(first.skipped, 0);
    assert.equal(second.sent, 0);
    assert.equal(second.skipped, 1);
    assert.equal(created.length, 1);
    assert.equal(created[0]?.type, "DAILY_WORK_REPORT");
    assert.equal(created[0]?.entityId, "2026-11-12");
    assert.equal(created[0]?.title, "Підсумок 12.11");
    assert.match(String(created[0]?.body), /Дзвінки: 0 вих/);
  });

  it("appends vertical team block for LEAD without double-counting lead in Разом", async () => {
    const created: Array<Record<string, unknown>> = [];
    const prisma = {
      user: {
        findMany: async (args: { where?: { leadId?: { in?: string[] } } }) => {
          if (args.where?.leadId) {
            return [
              { id: "m1", fullName: "Іванов", leadId: "lead1" },
              { id: "m2", fullName: "Петров", leadId: "lead1" },
            ];
          }
          return [{ id: "lead1", fullName: "Керівник", role: UserRole.LEAD }];
        },
      },
      userNotification: { findFirst: async () => null },
      call: {
        groupBy: async () => [
          { managerUserId: "lead1", direction: "OUTBOUND", _count: { id: 9 } },
          { managerUserId: "m1", direction: "OUTBOUND", _count: { id: 8 } },
          { managerUserId: "m1", direction: "INBOUND", _count: { id: 3 } },
        ],
      },
      visit: { findMany: async () => [] },
      order: { findMany: async () => [] },
      payment: { findMany: async () => [] },
      lead: {
        groupBy: async (args: { where?: { createdAt?: unknown; status?: unknown } }) => {
          if (args.where?.createdAt) {
            return [
              { ownerId: "m1", _count: { id: 2 } },
              { ownerId: "m2", _count: { id: 0 } },
            ];
          }
          return [
            { ownerId: "m1", _count: { id: 14 } },
            { ownerId: "m2", _count: { id: 3 } },
            { ownerId: "lead1", _count: { id: 1 } },
          ];
        },
      },
    };

    const settings = {
      getExchangeRates: async () => ({
        UAH_TO_USD: 0.024,
        EUR_TO_USD: 1.05,
        baseCurrency: "USD" as const,
      }),
      getTelegramDailyWorkReportConfig: async () => ({
        enabled: true,
        time: "18:00",
        weekdaysOnly: true,
        teamSummary: true,
      }),
    };

    const notifications = {
      create: async (params: Record<string, unknown>) => {
        created.push(params);
        return { id: "n1" };
      },
    };

    const svc = new ManagerDailyReportService(
      prisma as never,
      settings as never,
      notifications as never,
    );

    const result = await svc.sendDailyReports("2026-11-12");
    assert.equal(result.sent, 1);
    const body = String(created[0]?.body);
    assert.match(body, /^Дзвінки: 9 вих\. \/ 0 вх\./m);
    assert.match(body, /^Команда$/m);
    assert.match(body, /^Іванов$/m);
    assert.match(body, /^Петров$/m);
    assert.match(body, /^Разом$/m);
    // Разом open leads = 14 + 3, not + lead's 1
    assert.match(body, /Разом\n[\s\S]*Усього лідів: 17/);
    assert.doesNotMatch(body, /Разом\n[\s\S]*Усього лідів: 18/);
  });
});
