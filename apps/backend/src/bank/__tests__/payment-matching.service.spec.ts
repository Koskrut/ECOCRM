import test from "node:test";
import assert from "node:assert/strict";
import { PaymentMatchingService } from "../payment-matching.service";

type AnyFn = (...args: any[]) => any;

function mockFn(impl?: AnyFn) {
  const fn = ((...args: any[]) => {
    fn.calls.push(args);
    return impl ? impl(...args) : undefined;
  }) as AnyFn & { calls: any[][] };
  fn.calls = [];
  return fn;
}

const bookedAt = new Date("2026-06-01T00:00:00Z");
const createdAt = new Date("2026-05-30T00:00:00Z");

function orderRow(overrides: Record<string, unknown>) {
  return {
    id: "o",
    orderNumber: "0000",
    debtAmount: 0,
    currency: "USD",
    exchangeRate: 45,
    createdAt,
    contactId: "c1",
    clientId: null,
    client: null,
    contact: { firstName: "Микола", lastName: "Сидоренко", phone: "" },
    company: null,
    ...overrides,
  };
}

// Order #9336: 56 USD @45 = 2520 UAH matches the transaction; #9000 (100 USD) does not.
const order9336 = orderRow({ id: "o-9336", orderNumber: "9336", debtAmount: 56 });
const orderOther = orderRow({ id: "o-9000", orderNumber: "9000", debtAmount: 100 });

function createService(contacts: any[], orders: any[]) {
  const prisma = {
    order: {
      findMany: mockFn(async (args: any) => {
        // Name path queries by contact/client; discovery queries by debtAmount window.
        if (args?.where?.OR) return orders;
        return orders;
      }),
      findUnique: mockFn(async () => order9336),
    },
    contact: {
      findMany: mockFn(async () => contacts),
    },
  };
  const suggestions = { getSuggestions: mockFn(async () => ({ autoMatchEligible: false })) };
  const payerAliases = {
    learnFromAllocation: mockFn(async () => undefined),
    writeAudit: mockFn(async () => undefined),
  };
  const service = new PaymentMatchingService(
    prisma as any,
    {} as any,
    suggestions as any,
    payerAliases as any,
  );
  return { service, prisma };
}

test("scoreCandidates: Сидоренко 2520 UAH auto-matches order 9336 among several open orders", async () => {
  const { service } = createService(
    [{ id: "c1", middleName: "Васильович" }],
    [order9336, orderOther],
  );
  const candidates = await service.scoreCandidates({
    id: "tx1",
    description: "Сплата за ....медматериалы, Сидоренко Микола Васильович",
    amount: 2520,
    currency: "UAH",
    bookedAt,
    counterpartyName: null,
  });
  const best = candidates[0];
  assert.ok(best, "expected a candidate");
  assert.strictEqual(best!.orderId, "o-9336");
  assert.ok(best!.score >= 90, `expected auto-match score, got ${best!.score}`);
  assert.ok(best!.matchReason?.includes("contactName"));
  assert.ok(best!.matchReason?.includes("amount"));
});

test("scoreCandidates: name matches but amount ambiguous across orders → no name signal", async () => {
  // Both orders now match the amount, so the name path cannot pick one.
  const ambiguous = [
    orderRow({ id: "o-a", orderNumber: "9336", debtAmount: 56 }),
    orderRow({ id: "o-b", orderNumber: "9337", debtAmount: 56 }),
  ];
  const { service } = createService([{ id: "c1", middleName: null }], ambiguous);
  const candidates = await service.scoreCandidates({
    id: "tx2",
    description: "Сплата, Сидоренко Микола",
    amount: 2520,
    currency: "UAH",
    bookedAt,
    counterpartyName: null,
  });
  // Discovery still scores both by amount+date, but neither gets the +70 name bonus.
  assert.ok(candidates.every((c) => !(c.matchReason ?? "").includes("contactName")));
  assert.ok(candidates.every((c) => c.score < 90));
});

test("tryDocumentAutoMatch: skips when orderNumber already resolves", async () => {
  const findFirst = mockFn(async () => ({ id: "o-order" }));
  const prisma = {
    order: { findFirst, findMany: mockFn(async () => []) },
    bankTransaction: { update: mockFn(async () => ({})) },
  };
  const { service } = createService([], []);
  (service as any).prisma = prisma;

  const result = await (service as any).tryDocumentAutoMatch({
    id: "tx-doc-skip",
    description: "замовлення 9336 рахунок INV-9",
    counterpartyName: null,
  });
  assert.deepEqual(result, { matched: false, needsReview: false });
  assert.equal(findFirst.calls.length, 1);
});

test("tryDocumentAutoMatch: unique invoice auto-matches", async () => {
  let paymentCreated = false;
  const bankUpdate = mockFn(async () => ({}));
  const findFirst = mockFn(async () => null);
  const findMany = mockFn(async (args: any) => {
    if (args.where?.invoiceNumber?.in) {
      return [{ id: "o-inv", invoiceNumber: "INV-9", waybillNumber: null }];
    }
    return [];
  });
  const prisma = {
    order: { findFirst, findMany },
    bankTransaction: { update: bankUpdate },
  };
  const { service } = createService([], []);
  (service as any).prisma = prisma;
  (service as any).createPaymentFromTransaction = async () => {
    paymentCreated = true;
  };

  const result = await (service as any).tryDocumentAutoMatch({
    id: "tx-inv",
    description: "оплата рахунок INV-9",
    counterpartyName: null,
  });
  assert.equal(result.matched, true);
  assert.ok(paymentCreated);
  assert.equal(bankUpdate.calls.length, 1);
  assert.equal(bankUpdate.calls[0]![0].data.matchStatus, "AUTO_MATCHED");
});

test("tryDocumentAutoMatch: ambiguous invoice needs review", async () => {
  const bankUpdate = mockFn(async () => ({}));
  const findFirst = mockFn(async () => null);
  const findMany = mockFn(async () => [
    { id: "o1", invoiceNumber: "INV-9", waybillNumber: null },
    { id: "o2", invoiceNumber: "INV-9", waybillNumber: null },
  ]);
  const prisma = {
    order: { findFirst, findMany },
    bankTransaction: { update: bankUpdate },
  };
  const { service } = createService([], []);
  (service as any).prisma = prisma;

  const result = await (service as any).tryDocumentAutoMatch({
    id: "tx-ambig",
    description: "рахунок INV-9",
    counterpartyName: null,
  });
  assert.equal(result.matched, false);
  assert.equal(result.needsReview, true);
  assert.equal(bankUpdate.calls[0]![0].data.matchStatus, "NEEDS_REVIEW");
});
