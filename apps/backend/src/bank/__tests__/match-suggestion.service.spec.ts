import test from "node:test";
import assert from "node:assert/strict";
import { MatchSuggestionService } from "../match-suggestion.service";

type AnyFn = (...args: any[]) => any;

function mockFn(impl?: AnyFn) {
  const fn = ((...args: any[]) => {
    fn.calls.push(args);
    return impl ? impl(...args) : undefined;
  }) as AnyFn & { calls: any[][] };
  fn.calls = [];
  return fn;
}

function orderRow(overrides: Record<string, unknown>) {
  return {
    id: "o1",
    orderNumber: "7001",
    debtAmount: 1000,
    currency: "UAH",
    exchangeRate: null,
    contactId: "c1",
    clientId: null,
    companyId: null,
    contact: { id: "c1", firstName: "Іван", lastName: "Петренко" },
    client: null,
    company: null,
    ...overrides,
  };
}

test("buildAutoMatchPlan: happy path same client debt sum", () => {
  const service = new MatchSuggestionService({} as any);
  const o1 = orderRow({ id: "a", orderNumber: "7001", debtAmount: 600 });
  const o2 = orderRow({ id: "b", orderNumber: "7002", debtAmount: 400 });
  const plan = service.buildAutoMatchPlan({
    resolvedFound: [o1, o2],
    notFound: [],
    explicitAmounts: {},
    matchAmount: 1000,
    txCurrency: "UAH",
    allocatedAmount: 0,
  });
  assert.ok(plan);
  assert.strictEqual(plan!.reason, "multi_order_debt_sum");
  assert.strictEqual(plan!.allocations.length, 2);
  const sum = plan!.allocations.reduce((s, a) => s + a.amount, 0);
  assert.ok(Math.abs(sum - 1000) <= 0.01);
});

test("buildAutoMatchPlan: rounds cents so split sum equals tx", () => {
  const service = new MatchSuggestionService({} as any);
  // 333.335 * 3 would drift; use amounts that need last-row fit against 1000.
  const o1 = orderRow({ id: "a", orderNumber: "7001", debtAmount: 333.33 });
  const o2 = orderRow({ id: "b", orderNumber: "7002", debtAmount: 333.33 });
  const o3 = orderRow({ id: "c", orderNumber: "7003", debtAmount: 333.34 });
  const plan = service.buildAutoMatchPlan({
    resolvedFound: [o1, o2, o3],
    notFound: [],
    explicitAmounts: {},
    matchAmount: 1000,
    txCurrency: "UAH",
    allocatedAmount: 0,
  });
  assert.ok(plan);
  const sum = plan!.allocations.reduce((s, a) => s + a.amount, 0);
  assert.strictEqual(sum, 1000);
});

test("buildAutoMatchPlan: reject different clients", () => {
  const service = new MatchSuggestionService({} as any);
  const o1 = orderRow({ id: "a", orderNumber: "7001", debtAmount: 600, contactId: "c1" });
  const o2 = orderRow({
    id: "b",
    orderNumber: "7002",
    debtAmount: 400,
    contactId: "c2",
    contact: { id: "c2", firstName: "Other", lastName: "Client" },
  });
  const plan = service.buildAutoMatchPlan({
    resolvedFound: [o1, o2],
    notFound: [],
    explicitAmounts: {},
    matchAmount: 1000,
    txCurrency: "UAH",
    allocatedAmount: 0,
  });
  assert.equal(plan, null);
});

test("buildAutoMatchPlan: reject amount mismatch", () => {
  const service = new MatchSuggestionService({} as any);
  const o1 = orderRow({ id: "a", orderNumber: "7001", debtAmount: 600 });
  const o2 = orderRow({ id: "b", orderNumber: "7002", debtAmount: 400 });
  const plan = service.buildAutoMatchPlan({
    resolvedFound: [o1, o2],
    notFound: [],
    explicitAmounts: {},
    matchAmount: 1500,
    txCurrency: "UAH",
    allocatedAmount: 0,
  });
  assert.equal(plan, null);
});

test("buildAutoMatchPlan: explicit purpose amounts", () => {
  const service = new MatchSuggestionService({} as any);
  const o1 = orderRow({ id: "a", orderNumber: "7001", debtAmount: 9999, explicitAmount: 1200 });
  const o2 = orderRow({ id: "b", orderNumber: "7002", debtAmount: 9999, explicitAmount: 800 });
  const plan = service.buildAutoMatchPlan({
    resolvedFound: [o1, o2] as any,
    notFound: [],
    explicitAmounts: { "7001": 1200, "7002": 800 },
    matchAmount: 2000,
    txCurrency: "UAH",
    allocatedAmount: 0,
  });
  assert.ok(plan);
  assert.strictEqual(plan!.reason, "multi_order_purpose_amounts");
});

test("getSuggestions: IBAN history boosts score", async () => {
  const order = orderRow({});
  const prisma = {
    order: {
      findMany: mockFn(async () => []),
    },
    payerAlias: {
      findMany: mockFn(async (args: any) => {
        if (args?.where?.counterpartyIban) {
          return [
            {
              contactId: "c1",
              companyId: null,
              hitCount: 3,
              lastSeenAt: new Date(),
              contact: { id: "c1", firstName: "Іван", lastName: "Петренко" },
              company: null,
            },
          ];
        }
        return [];
      }),
    },
    payment: {
      findMany: mockFn(async () => []),
    },
    company: {
      findMany: mockFn(async () => []),
    },
  };
  const service = new MatchSuggestionService(prisma as any);
  const result = await service.getSuggestions({
    id: "tx1",
    description: "оплата",
    amount: 1000,
    currency: "UAH",
    bookedAt: new Date(),
    counterpartyName: "Петренко",
    counterpartyIban: "UA123",
    payments: [],
  });
  // Load open orders for client was called
  assert.ok(prisma.order.findMany.calls.length >= 1);
  void order;
  const top = result.suggestions[0];
  assert.ok(top);
  assert.ok(top!.reasons.includes("iban_history"));
  assert.ok(top!.score >= 40);
});
