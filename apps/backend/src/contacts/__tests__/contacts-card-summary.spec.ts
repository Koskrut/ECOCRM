import test from "node:test";
import assert from "node:assert/strict";
import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { ContactsService } from "../contacts.service";
import type { AuthUser } from "../../auth/auth.types";

type AnyFn = (...args: any[]) => any;

function mockFn(impl?: AnyFn) {
  const fn = ((...args: any[]) => {
    fn.calls.push(args);
    if (impl) return impl(...args);
    return undefined;
  }) as AnyFn & { calls: any[][] };
  fn.calls = [];
  return fn;
}

function createService(overrides?: Partial<any>) {
  const prisma = {
    contact: { findUnique: mockFn() },
    order: { findMany: mockFn(), count: mockFn() },
    activity: { findFirst: mockFn() },
    task: { count: mockFn(), findFirst: mockFn() },
    ...overrides,
  };
  const service = new ContactsService(prisma as any);
  return { service, prisma };
}

function manager(id: string): AuthUser {
  return { id, email: `${id}@crm.test`, fullName: id, role: UserRole.MANAGER };
}

test("getCardSummary: denies manager for чужой assigned contact", async () => {
  const { service } = createService({
    contact: {
      findUnique: mockFn(async () => ({
        id: "c1",
        ownerId: "owner-2",
        firstName: "Ivan",
        lastName: "Petrenko",
        status: null,
        clientType: null,
        city: null,
        region: null,
        email: null,
        phone: "+380111111111",
        companyId: null,
        company: null,
        owner: null,
        phones: [],
      })),
    },
  });

  await assert.rejects(() => service.getCardSummary("c1", manager("owner-1")), ForbiddenException);
});

test("getCardSummary: allows manager for unassigned contact and returns unassigned badge", async () => {
  const { service } = createService({
    contact: {
      findUnique: mockFn(async () => ({
        id: "c1",
        ownerId: null,
        firstName: "Ivan",
        lastName: "Petrenko",
        status: "Клієнт",
        clientType: "Врач",
        city: "Kyiv",
        region: "Kyivska",
        email: "i@test.com",
        phone: "+380111111111",
        companyId: null,
        company: null,
        owner: null,
        phones: [],
      })),
    },
    order: {
      findMany: mockFn(async () => []),
      count: mockFn(async () => 0),
    },
    activity: { findFirst: mockFn(async () => null) },
    task: {
      count: mockFn(async () => 0),
      findFirst: mockFn(async () => null),
    },
  });

  const result = await service.getCardSummary("c1", manager("m1"));
  assert.equal(result.contact.isUnassigned, true);
  assert.equal(result.contact.badges.includes("unassigned"), true);
});

test("getCardSummary: uses canonical Order.clientId scope and visibility note", async () => {
  const { service, prisma } = createService({
    contact: {
      findUnique: mockFn(async () => ({
        id: "c1",
        ownerId: "m1",
        firstName: "Ivan",
        lastName: "Petrenko",
        status: null,
        clientType: null,
        city: null,
        region: null,
        email: null,
        phone: "+380111111111",
        companyId: "co1",
        company: { id: "co1", name: "Acme" },
        owner: { id: "m1", fullName: "Manager" },
        phones: [{ phone: "+380222222222" }],
      })),
    },
    order: {
      findMany: mockFn(async () => [
        {
          createdAt: new Date("2026-03-01T10:00:00.000Z"),
          totalAmount: 1000,
          returnAdjustmentAmount: 100,
          debtAmount: 200,
          financialStatus: "OVERDUE",
        },
      ]),
      count: mockFn(async () => 2),
    },
    activity: {
      findFirst: mockFn(async () => ({
        occurredAt: new Date("2026-03-03T10:00:00.000Z"),
        createdAt: new Date("2026-03-03T10:00:00.000Z"),
      })),
    },
    task: {
      count: mockFn(async (args: any) =>
        args?.where?.dueAt ? 1 : 2,
      ),
      findFirst: mockFn(async () => ({ title: "Follow up", dueAt: new Date("2026-03-05T10:00:00.000Z") })),
    },
  });

  const result = await service.getCardSummary("c1", manager("m1"));

  assert.equal(result.kpi.ordersCount, 1);
  assert.equal(result.kpi.revenue, 900);
  assert.equal(result.kpi.debt, 200);
  assert.equal(result.kpi.overdue, 200);
  assert.equal(result.insights.financeRestricted, true);
  assert.equal(result.insights.scopeNote, "Показаны только доступные вам сделки");
  assert.equal(result.contact.phones.length, 2);

  // Ensure canonical scope query uses clientId and manager visibility.
  const orderFindManyCall = (prisma.order.findMany as any).calls[0]?.[0];
  assert.equal(orderFindManyCall.where.clientId, "c1");
  assert.equal(orderFindManyCall.where.ownerId, "m1");
  const activityFindFirstCall = (prisma.activity.findFirst as any).calls[0]?.[0];
  assert.equal(activityFindFirstCall.where.contactId, "c1");
  assert.equal(activityFindFirstCall.where.type.not, "COMMENT");
});

test("getCardSummary: ADMIN sees full scope without finance restriction", async () => {
  const { service, prisma } = createService({
    contact: {
      findUnique: mockFn(async () => ({
        id: "c-admin",
        ownerId: "owner-x",
        firstName: "Admin",
        lastName: "Contact",
        status: null,
        clientType: null,
        city: null,
        region: null,
        email: null,
        phone: "+380333333333",
        companyId: null,
        company: null,
        owner: { id: "owner-x", fullName: "Owner X" },
        phones: [],
      })),
    },
    order: {
      findMany: mockFn(async () => [
        {
          createdAt: new Date("2026-03-01T10:00:00.000Z"),
          totalAmount: 1000,
          returnAdjustmentAmount: 0,
          debtAmount: 0,
          financialStatus: "PAID",
        },
        {
          createdAt: new Date("2026-03-02T10:00:00.000Z"),
          totalAmount: 2000,
          returnAdjustmentAmount: 500,
          debtAmount: 150,
          financialStatus: "AWAITING_PAYMENT",
        },
      ]),
      count: mockFn(async () => 2),
    },
    activity: {
      findFirst: mockFn(async () => ({
        occurredAt: new Date("2026-03-03T10:00:00.000Z"),
        createdAt: new Date("2026-03-03T10:00:00.000Z"),
      })),
    },
    task: {
      count: mockFn(async () => 0),
      findFirst: mockFn(async () => null),
    },
  });

  const admin: AuthUser = {
    id: "admin-1",
    email: "admin@test.com",
    fullName: "Admin",
    role: UserRole.ADMIN,
  };

  const result = await service.getCardSummary("c-admin", admin);
  assert.equal(result.kpi.ordersCount, 2);
  assert.equal(result.kpi.revenue, 2500);
  assert.equal(result.kpi.debt, 150);
  assert.equal(result.insights.financeRestricted, false);
  assert.equal(result.insights.scopeNote, null);

  const orderFindManyCall = (prisma.order.findMany as any).calls[0]?.[0];
  assert.equal(orderFindManyCall.where.clientId, "c-admin");
  assert.equal("ownerId" in orderFindManyCall.where, false);
});

test("getCardSummary: empty-state summary for contact with no orders/activity/tasks", async () => {
  const { service } = createService({
    contact: {
      findUnique: mockFn(async () => ({
        id: "c-empty",
        ownerId: null,
        firstName: "Empty",
        lastName: "State",
        status: null,
        clientType: null,
        city: null,
        region: null,
        email: null,
        phone: "+380000000000",
        companyId: null,
        company: null,
        owner: null,
        phones: [],
      })),
    },
    order: {
      findMany: mockFn(async () => []),
      count: mockFn(async () => 0),
    },
    activity: { findFirst: mockFn(async () => null) },
    task: {
      count: mockFn(async () => 0),
      findFirst: mockFn(async () => null),
    },
  });

  const result = await service.getCardSummary("c-empty");
  assert.equal(result.kpi.ordersCount, 0);
  assert.equal(result.kpi.revenue, 0);
  assert.equal(result.kpi.debt, 0);
  assert.equal(result.kpi.overdue, 0);
  assert.equal(result.kpi.lastOrderAt, null);
  assert.equal(result.kpi.lastActivityAt, null);
  assert.equal(result.kpi.openTasksCount, 0);
  assert.equal(result.kpi.overdueTasksCount, 0);
  assert.equal(result.insights.nextStep, null);
  assert.equal(result.insights.financeRestricted, false);
});

test("getCardAnalytics: contact scope returns series and top products", async () => {
  const { service } = createService({
    contact: {
      findUnique: mockFn(async () => ({
        id: "c1",
        ownerId: "m1",
        companyId: "co1",
      })),
    },
    order: {
      findMany: mockFn(async () => [
        {
          id: "o1",
          createdAt: new Date("2026-03-01T10:00:00.000Z"),
          totalAmount: 1000,
          returnAdjustmentAmount: 100,
          items: [
            {
              productId: "p1",
              productNameSnapshot: "Implant",
              qty: 2,
              lineTotal: 500,
              product: { name: "Implant X" },
            },
          ],
        },
      ]),
      count: mockFn(async () => 1),
    },
  });

  const result = await service.getCardAnalytics("c1", { range: "30d", scope: "contact" }, manager("m1"));
  assert.equal(result.meta.scope, "contact");
  assert.equal(result.kpi.ordersCount, 1);
  assert.equal(result.kpi.revenue, 900);
  assert.equal(result.topProducts.length, 1);
  assert.equal(result.topProducts[0]?.productName, "Implant X");
  assert.equal(result.series.revenueByPeriod.length, 1);
});

test("getCardAnalytics: company scope fallback when no company", async () => {
  const { service } = createService({
    contact: {
      findUnique: mockFn(async () => ({
        id: "c2",
        ownerId: null,
        companyId: null,
      })),
    },
    order: {
      findMany: mockFn(async () => []),
      count: mockFn(async () => 0),
    },
  });

  const result = await service.getCardAnalytics("c2", { range: "90d", scope: "company" });
  assert.equal(result.meta.scope, "contact");
  assert.equal(result.meta.companyScopeAvailable, false);
  assert.equal(result.kpi.ordersCount, 0);
});

test("getCardAnalytics: manager finance restriction when full scope is larger", async () => {
  const { service } = createService({
    contact: {
      findUnique: mockFn(async () => ({
        id: "c3",
        ownerId: "m3",
        companyId: "co3",
      })),
    },
    order: {
      findMany: mockFn(async () => [
        {
          id: "o1",
          createdAt: new Date("2026-03-01T10:00:00.000Z"),
          totalAmount: 200,
          returnAdjustmentAmount: 0,
          items: [],
        },
      ]),
      count: mockFn(async () => 3),
    },
  });

  const result = await service.getCardAnalytics("c3", { range: "365d", scope: "contact" }, manager("m3"));
  assert.equal(result.meta.financeRestricted, true);
  assert.equal(result.meta.scopeNote, "Показаны только доступные вам сделки");
});

test("getCardAnalytics: admin sees full scope without restriction", async () => {
  const { service } = createService({
    contact: {
      findUnique: mockFn(async () => ({
        id: "c4",
        ownerId: "owner-x",
        companyId: "co4",
      })),
    },
    order: {
      findMany: mockFn(async () => [
        {
          id: "o1",
          createdAt: new Date("2026-03-10T10:00:00.000Z"),
          totalAmount: 300,
          returnAdjustmentAmount: 50,
          items: [],
        },
      ]),
      count: mockFn(async () => 1),
    },
  });

  const admin: AuthUser = {
    id: "admin-1",
    email: "admin@test.com",
    fullName: "Admin",
    role: UserRole.ADMIN,
  };
  const result = await service.getCardAnalytics("c4", { range: "30d", scope: "company" }, admin);
  assert.equal(result.meta.financeRestricted, false);
  assert.equal(result.meta.scope, "company");
  assert.equal(result.kpi.revenue, 250);
});

