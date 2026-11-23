import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UserRole } from "@prisma/client";
import { ManagerMorningBriefService } from "../manager-morning-brief.service";

const rates = {
  UAH_TO_USD: 0.024,
  EUR_TO_USD: 1.05,
  baseCurrency: "USD" as const,
};

describe("ManagerMorningBriefService.sendMorningBriefs", () => {
  it("sends leads, at-risk count and top overdue once per day", async () => {
    const created: Array<Record<string, unknown>> = [];
    let existing = false;
    const prisma = {
      user: {
        findMany: async () => [{ id: "mgr1", role: UserRole.MANAGER }],
      },
      userNotification: {
        findFirst: async () => (existing ? { id: "already" } : null),
      },
      lead: {
        groupBy: async () => [{ ownerId: "mgr1", _count: { id: 14 } }],
      },
      contact: {
        findMany: async () => [
          {
            id: "risk",
            ownerId: "mgr1",
            createdAt: new Date("2024-01-01"),
            firstName: "Олена",
            lastName: "Ризик",
            status: null,
            marketingCallOptOut: false,
          },
          {
            id: "dup",
            ownerId: "mgr1",
            createdAt: new Date("2024-01-01"),
            firstName: "Дубль",
            lastName: "Клієнт",
            status: "Дублікат",
            marketingCallOptOut: false,
          },
          {
            id: "ok",
            ownerId: "mgr1",
            createdAt: new Date("2024-01-01"),
            firstName: "Живий",
            lastName: "Клієнт",
            status: null,
            marketingCallOptOut: false,
          },
        ],
      },
      order: {
        findMany: async () => [
          {
            debtAmount: 100,
            currency: "USD",
            paymentDueDate: new Date("2026-11-01T00:00:00.000Z"),
            client: { id: "c-small", ownerId: "mgr1", firstName: "Олег", lastName: "Малий" },
          },
          {
            debtAmount: 900,
            currency: "USD",
            paymentDueDate: new Date("2026-10-01T00:00:00.000Z"),
            client: { id: "c-big", ownerId: "mgr1", firstName: "Марія", lastName: "Коваль" },
          },
          {
            debtAmount: 50,
            currency: "USD",
            paymentDueDate: new Date("2026-10-20T00:00:00.000Z"),
            client: { id: "c-big", ownerId: "mgr1", firstName: "Марія", lastName: "Коваль" },
          },
        ],
      },
    };
    const insights = {
      buildExclusionSet: (contact: { status: string | null }) =>
        contact.status === "Дублікат" ? ["DUPLICATE_MARKED"] : [],
      buildSignalsForContacts: async (contacts: Array<{ id: string }>) => {
        const map = new Map<
          string,
          { isAtRisk: boolean; daysSinceLastOrder: number | null; daysSinceLastContact: number | null }
        >();
        for (const contact of contacts) {
          map.set(contact.id, {
            isAtRisk: contact.id === "risk",
            daysSinceLastOrder: contact.id === "risk" ? 52 : 3,
            daysSinceLastContact: contact.id === "risk" ? 31 : 1,
          });
        }
        return map;
      },
    };
    const notifications = {
      create: async (params: Record<string, unknown>) => {
        created.push(params);
        existing = true;
        return { id: "n1" };
      },
    };
    const settings = {
      getTelegramMorningBriefConfig: async () => ({
        enabled: true,
        time: "08:30",
        weekdaysOnly: true,
      }),
      getExchangeRates: async () => rates,
    };
    const svc = new ManagerMorningBriefService(
      prisma as never,
      settings as never,
      notifications as never,
      insights as never,
    );

    const first = await svc.sendMorningBriefs("2026-11-23");
    const second = await svc.sendMorningBriefs("2026-11-23");

    assert.equal(first.sent, 1);
    assert.equal(second.sent, 0);
    assert.equal(second.skipped, 1);
    assert.equal(created[0]?.type, "MORNING_BRIEF");
    assert.equal(created[0]?.entityId, "2026-11-23");
    assert.equal(created[0]?.title, "Ранок 23.11");
    const body = String(created[0]?.body);
    assert.match(body, /Ліди: 14/);
    assert.match(body, /Ризик втрати: 1/);
    assert.match(body, /1\. Ризик Олена · замовлення 52 дн\. · контакт 31 дн\./);
    assert.doesNotMatch(body, /Дубль/);
    assert.match(body, /Прострочена дебіторка: 2/);
    assert.match(body, /1\. Коваль Марія · 950 USD/);
    assert.match(body, /2\. Малий Олег · 100 USD/);
  });

  it("does nothing when the morning brief is disabled", async () => {
    let called = false;
    const svc = new ManagerMorningBriefService(
      { user: { findMany: async () => { called = true; return []; } } } as never,
      {
        getTelegramMorningBriefConfig: async () => ({
          enabled: false,
          time: "08:30",
          weekdaysOnly: true,
        }),
      } as never,
      { create: async () => null } as never,
      {} as never,
    );
    const result = await svc.sendMorningBriefs("2026-11-23");
    assert.deepEqual(result, { sent: 0, skipped: 0 });
    assert.equal(called, false);
  });
});
