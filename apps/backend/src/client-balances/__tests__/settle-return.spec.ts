import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { ClientBalancesService } from "../client-balances.service";

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

const returnRow = {
  id: "r1",
  orderId: "o1",
  settledAt: null,
  items: [{ qtyReturned: 1, orderItem: { qty: 1, lineTotal: 300 } }],
  order: {
    id: "o1",
    ownerId: "m1",
    orderNumber: "1001",
    currency: "USD",
    totalAmount: 1000,
    subtotalAmount: 1000,
    paidAmount: 1000,
    returnAdjustmentAmount: 300,
    clientId: "c1",
    contactId: null,
    companyId: null,
  },
};

describe("ClientBalancesService.settleReturn", () => {
  it("moves overpayment off the order with a negative payment", async () => {
    const paymentCreate = mockFn(async () => ({ id: "pay-1" }));
    const tx = {
      order: {
        findUnique: mockFn(async () => ({
          totalAmount: 1000,
          subtotalAmount: 1000,
          paidAmount: 1000,
        })),
      },
      orderReturn: {
        findMany: mockFn(async () => []),
        findUnique: mockFn(async () => returnRow),
        updateMany: mockFn(async () => ({ count: 1 })),
      },
      clientBalance: {
        findUnique: mockFn(async () => ({ id: "bal-1", amount: 0 })),
        update: mockFn(async () => ({ id: "bal-1", amount: 300 })),
      },
      clientBalanceTransaction: {
        create: mockFn(async () => ({ id: "tx-1" })),
        update: mockFn(async () => ({})),
      },
      payment: { create: paymentCreate },
    };
    const prisma = {
      orderReturn: {
        findUnique: mockFn(async () => returnRow),
        findMany: mockFn(async () => []),
      },
      $transaction: mockFn(async (fn: (client: typeof tx) => Promise<void>) => fn(tx)),
    };
    const payments = { recalcOrder: mockFn(async () => {}) };
    const settings = {
      getExchangeRates: async () => ({ UAH_TO_USD: 0.025, EUR_TO_USD: 1.25, baseCurrency: "USD" }),
    };
    const svc = new ClientBalancesService(prisma as any, settings as any, payments as any);

    await svc.settleReturn("r1", { type: "CREDIT", creditAmount: 300 });

    assert.equal(paymentCreate.calls.length, 1);
    const payment = paymentCreate.calls[0][0].data;
    assert.equal(payment.amount, -300);
    assert.equal(payment.amountUsd, -300);
    assert.equal(payment.currency, "USD");
    assert.equal(payment.sourceType, "CREDIT");
    assert.equal(payments.recalcOrder.calls[0][0], "o1");
    assert.equal(tx.clientBalance.update.calls[0][0].data.amount.increment, 300);
  });

  it("rejects a second settlement of the same return", async () => {
    const prisma = {
      orderReturn: {
        findUnique: mockFn(async () => ({ ...returnRow, settledAt: new Date() })),
        findMany: mockFn(async () => []),
      },
    };
    const svc = new ClientBalancesService(prisma as any, {} as any, { recalcOrder: async () => {} } as any);
    await assert.rejects(
      () => svc.settleReturn("r1", { type: "CREDIT", creditAmount: 300 }),
      BadRequestException,
    );
  });
});

describe("ClientBalancesService.applyCreditToOrder", () => {
  it("rejects credit above debt left after an FX write-off", async () => {
    const prisma = {
      order: {
        findUnique: mockFn(async () => ({
          id: "o1",
          ownerId: "m1",
          orderNumber: "1001",
          currency: "USD",
          totalAmount: 100,
          paidAmount: 99,
          returnAdjustmentAmount: 0,
          fxWriteOffAmount: 1,
          orderStage: "RECEIVED",
          clientId: "c1",
          contactId: null,
          companyId: null,
        })),
      },
    };
    const svc = new ClientBalancesService(prisma as any, {} as any, { recalcOrder: async () => {} } as any);
    await assert.rejects(
      () => svc.applyCreditToOrder("o1", { amount: 1 }),
      /no debt/i,
    );
  });
});
