import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import { ContactsInsightsService } from "../contacts-insights.service";

const nowMs = Date.now();

function ago(days: number): Date {
  return new Date(nowMs - days * 24 * 60 * 60 * 1000 - 3 * 60 * 60 * 1000);
}

function harness(touches: Array<{ contactId: string; at: Date }>) {
  const orders: unknown[] = [];
  let orderWhere: unknown;
  let touchSql = "";
  const prisma = {
    task: { groupBy: async () => [] },
    order: {
      findMany: async (args: { where?: unknown }) => {
        orderWhere = args.where;
        return orders;
      },
    },
    clientBalance: {
      findMany: async () => [{ holderId: "c1", amount: 50, currency: "USD" }],
    },
    $queryRaw: async (query: { strings?: string[] }) => {
      touchSql = (query.strings ?? []).join(" ");
      return touches;
    },
  };
  const settings = {
    getExchangeRates: async () => ({
      UAH_TO_USD: 0.025,
      EUR_TO_USD: 1.08,
      baseCurrency: "USD" as const,
    }),
  };
  return {
    orders,
    orderWhere: () => orderWhere,
    touchSql: () => touchSql,
    service: new ContactsInsightsService(prisma as never, settings as never),
  };
}

test("signals use every order party, messages, and only the manager's own debt", async () => {
  const h = harness([
    { contactId: "c1", at: ago(40) },
    { contactId: "c2", at: ago(8) },
    { contactId: "c6", at: ago(4) },
  ]);
  h.orders.push(
    {
      clientId: "c1",
      contactId: "c1",
      ownerId: "other",
      createdAt: ago(2),
      totalAmount: 400,
      returnAdjustmentAmount: 0,
      debtAmount: 0,
      creditAmount: 0,
      paidAmount: 0,
      currency: "USD",
      paymentDueDate: null,
      orderStage: "CANCELED",
      legacySource: null,
    },
    {
      clientId: "c1",
      contactId: null,
      ownerId: "other",
      createdAt: ago(12),
      totalAmount: 1500,
      returnAdjustmentAmount: 0,
      debtAmount: 200,
      creditAmount: 0,
      paidAmount: 0,
      currency: "USD",
      paymentDueDate: null,
      orderStage: "SHIPPED",
      legacySource: null,
    },
    {
      clientId: "buyer",
      contactId: "ttn",
      ownerId: "other",
      createdAt: ago(6),
      totalAmount: 300,
      returnAdjustmentAmount: 0,
      debtAmount: 80,
      creditAmount: 0,
      paidAmount: 0,
      currency: "USD",
      paymentDueDate: null,
      orderStage: "SHIPPED",
      legacySource: null,
    },
    {
      clientId: "c7",
      contactId: null,
      ownerId: "mgr",
      createdAt: ago(5),
      totalAmount: 80000,
      returnAdjustmentAmount: 0,
      debtAmount: 0,
      creditAmount: 0,
      paidAmount: 0,
      currency: "UAH",
      paymentDueDate: null,
      orderStage: "COMPLETED",
      legacySource: null,
    },
  );

  const contacts = [
    { id: "c1", createdAt: ago(100) },
    { id: "c2", createdAt: ago(200) },
    { id: "c4", createdAt: ago(10) },
    { id: "c8", createdAt: ago(20) },
    { id: "ttn", createdAt: ago(30) },
    { id: "c6", createdAt: ago(200) },
    { id: "c7", createdAt: ago(30) },
  ];

  const open = await h.service.buildSignalsForContacts(contacts);
  const recentBuyer = open.get("c1");
  assert.ok(recentBuyer);
  assert.equal(recentBuyer.daysSinceLastContact, 2);
  assert.equal(recentBuyer.daysSinceLastOrder, 12);
  assert.equal(recentBuyer.isAtRisk, false);
  assert.equal(recentBuyer.debtAmount, 150);
  assert.equal(recentBuyer.revenue30, 1500);

  const ttn = open.get("ttn");
  assert.ok(ttn);
  assert.equal(ttn.daysSinceLastOrder, 6);
  assert.equal(ttn.daysSinceLastContact, 6);
  assert.equal(ttn.hasOrderHistory, true);
  assert.equal(ttn.debtAmount, 0);
  assert.equal(ttn.revenue30, 0);

  const untouched = open.get("c8");
  assert.ok(untouched);
  assert.equal(untouched.lastContactAt, null);
  assert.equal(untouched.daysSinceLastContact, 20);
  assert.equal(untouched.isNewLeadNoFirstContact, false);

  const stillNew = open.get("c4");
  assert.ok(stillNew);
  assert.equal(stillNew.isNewLeadNoFirstContact, true);
  assert.equal(stillNew.daysSinceLastContact, null);

  const uah = open.get("c7");
  assert.ok(uah);
  assert.equal(uah.revenue30, 2000);

  const manager = {
    id: "mgr",
    email: "m@test",
    fullName: "Manager",
    role: UserRole.MANAGER,
  };
  const scoped = await h.service.buildSignalsForContacts(contacts, manager);
  assert.equal(scoped.get("c1")?.debtAmount, 0);
  assert.equal(scoped.get("c1")?.daysSinceLastOrder, 12);
  assert.equal(scoped.get("c7")?.revenue30, 2000);

  const where = h.orderWhere() as { OR?: unknown[]; ownerId?: string };
  assert.ok(Array.isArray(where.OR));
  assert.equal(where.ownerId, undefined);
  const sql = h.touchSql();
  assert.match(sql, /COALESCE\(a\."occurredAt", a\."createdAt"\)/);
  assert.match(sql, /ILIKE '%miss%'/);
  assert.match(sql, /"Conversation"/);
  assert.match(sql, /"TelegramAccount"/);
  assert.match(sql, /"MetaParticipant"/);
});

test("duplicate status is excluded from the work queue", () => {
  const service = new ContactsInsightsService({} as never);
  const reasons = service.buildExclusionSet({ status: "Дублікат", marketingCallOptOut: false });
  assert.deepEqual(reasons, ["DUPLICATE_MARKED"]);
  const client = service.buildExclusionSet({ status: "Клієнт", marketingCallOptOut: false });
  assert.deepEqual(client, []);
});
