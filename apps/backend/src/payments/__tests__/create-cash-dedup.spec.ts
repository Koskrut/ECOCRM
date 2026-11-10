import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConflictException } from "@nestjs/common";
import { PaymentSourceType, PaymentStatus, UserRole } from "@prisma/client";
import { PaymentsService } from "../payments.service";
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

function manager(id = "m1"): AuthUser {
  return { id, email: `${id}@t.com`, fullName: id, role: UserRole.MANAGER };
}

function admin(): AuthUser {
  return { id: "a1", email: "a@t.com", fullName: "Admin", role: UserRole.ADMIN };
}

function mockAudit() {
  return {
    write: mockFn(async () => ({})),
    buildUpdatePayload: (input: unknown) => input,
  };
}

describe("PaymentsService.createCash dedup", () => {
  const paidAt = new Date("2026-06-01T12:00:00.000Z");
  const dto = {
    orderId: "o1",
    amount: 500,
    currency: "UAH",
    paidAt: paidAt.toISOString(),
  };

  it("throws ConflictException when duplicate cash payment detected", async () => {
    const paymentCreate = mockFn();
    const findFirst = mockFn(async () => ({
      id: "existing",
      orderId: "o1",
      amount: 500,
      currency: "UAH",
      paidAt,
      status: PaymentStatus.COMPLETED,
      sourceType: PaymentSourceType.CASH,
      order: { orderNumber: "ORD-1" },
      createdBy: { fullName: "Manager" },
    }));
    const findMany = mockFn(async () => [{ id: "existing", amount: 500, currency: "UAH", amountUsd: 12 }]);
    const prisma = {
      order: {
        findUnique: mockFn(async () => ({
          id: "o1",
          ownerId: "m1",
          currency: "UAH",
          clientId: "c1",
          contactId: null,
        })),
      },
      payment: { findFirst, create: paymentCreate, findMany },
    };
    const settings = { getExchangeRates: async () => ({ UAH_TO_USD: 0.024 }) };
    const audit = mockAudit();
    const svc = new PaymentsService(prisma as any, settings as any, {} as any, audit as any);

    await assert.rejects(() => svc.createCash(dto, manager()), ConflictException);
    assert.equal(paymentCreate.calls.length, 0);
    assert.equal(findFirst.calls.length, 1);
  });

  it("creates payment when no duplicate exists", async () => {
    const paymentCreate = mockFn(async () => ({ id: "p-new" }));
    const prisma = {
      order: {
        findUnique: mockFn(async () => ({
          id: "o1",
          ownerId: "m1",
          currency: "UAH",
          clientId: "c1",
          contactId: null,
        })),
        update: mockFn(async () => ({})),
      },
      payment: {
        findFirst: mockFn(async () => null),
        create: paymentCreate,
        findMany: mockFn(async () => []),
      },
    };
    const settings = { getExchangeRates: async () => ({ UAH_TO_USD: 0.024 }) };
    const audit = {
      write: mockFn(async () => ({})),
      buildUpdatePayload: (input: unknown) => input,
    };
    const svc = new PaymentsService(prisma as any, settings as any, {} as any, audit as any);
    (svc as any).recalcOrder = mockFn(async () => {});

    await svc.createCash(dto, manager());
    assert.equal(paymentCreate.calls.length, 1);
    assert.equal(paymentCreate.calls[0][0].data.sourceType, PaymentSourceType.CASH);
  });
});

describe("PaymentsService.allocate race safety", () => {
  it("rejects allocation when remaining changed under lock", async () => {
    const txId = "tx1";
    const orderId = "o1";
    const payments = [{ amount: 50, status: "COMPLETED" }];
    const lockedPayments = [{ amount: 100, status: "COMPLETED" }];

    const prisma = {
      bankTransaction: {
        findUnique: mockFn(async () => ({
          id: txId,
          bankAccountId: "ba1",
          amount: 100,
          currency: "UAH",
          bookedAt: new Date(),
          payments,
        })),
      },
      order: {
        findUnique: mockFn(async () => ({ id: orderId, ownerId: "m1" })),
      },
      $transaction: mockFn(async (fn: AnyFn) =>
        fn({
          $queryRaw: mockFn(async () => []),
          bankTransaction: {
            findUnique: mockFn(async () => ({
              id: txId,
              amount: 100,
              currency: "UAH",
              bookedAt: new Date(),
              payments: lockedPayments,
            })),
          },
          payment: { create: mockFn(async () => ({ id: "p1" })) },
        }),
      ),
    };
    const settings = { getExchangeRates: async () => ({ UAH_TO_USD: 0.024 }) };
    const audit = mockAudit();
    const bankAccounts = { getVisibleBankAccountIds: mockFn(async () => ["ba1"]) };
    const svc = new PaymentsService(prisma as any, settings as any, bankAccounts as any, audit as any);

    await assert.rejects(
      () => svc.allocate({ transactionId: txId, orderId }, admin()),
      /already fully allocated/,
    );
  });
});

describe("PaymentsService.allocateSplit", () => {
  it("requires split total to equal transaction amount when nothing allocated", async () => {
    const txId = "tx1";
    const prisma = {
      bankTransaction: {
        findUnique: mockFn(async () => ({
          id: txId,
          bankAccountId: "ba1",
          amount: 100,
          currency: "UAH",
          bookedAt: new Date(),
          payments: [],
        })),
      },
      order: {
        findUnique: mockFn(async (args: any) => ({
          id: args.where.id,
          ownerId: "m1",
        })),
      },
      $transaction: mockFn(async () => undefined),
    };
    const settings = { getExchangeRates: async () => ({ UAH_TO_USD: 0.024 }) };
    const audit = mockAudit();
    const bankAccounts = { getVisibleBankAccountIds: mockFn(async () => ["ba1"]) };
    const svc = new PaymentsService(prisma as any, settings as any, bankAccounts as any, audit as any);

    await assert.rejects(
      () =>
        svc.allocateSplitInternal({
          transactionId: txId,
          allocations: [
            { orderId: "o1", amount: 60 },
            { orderId: "o2", amount: 30 },
          ],
          actor: admin(),
        }),
      /must equal remaining amount 100/,
    );
  });

  it("writes amountUsd from the order rate, not the settings rate", async () => {
    const txId = "tx1";
    const paymentCreate = mockFn(async () => ({ id: "p-new" }));
    const tx = {
      id: txId,
      bankAccountId: "ba1",
      amount: 4500,
      currency: "UAH",
      bookedAt: new Date("2026-06-01T00:00:00.000Z"),
      payments: [] as unknown[],
      matchStatus: "UNMATCHED",
    };
    const prisma = {
      bankTransaction: {
        findUnique: mockFn(async () => tx),
      },
      order: {
        findUnique: mockFn(async (args: { where: { id: string } }) => ({
          id: args.where.id,
          ownerId: "m1",
          currency: "USD",
          exchangeRate: args.where.id === "o2" ? 50 : 45,
          totalAmount: 100,
          debtAmount: 100,
        })),
      },
      $transaction: mockFn(async (fn: (db: any) => Promise<void>) =>
        fn({
          $queryRaw: async () => [],
          bankTransaction: { findUnique: async () => tx },
          payment: { create: paymentCreate },
        }),
      ),
    };
    const settings = { getExchangeRates: async () => ({ UAH_TO_USD: 1 / 47, EUR_TO_USD: 1.1 }) };
    const svc = new PaymentsService(
      prisma as any,
      settings as any,
      { getVisibleBankAccountIds: mockFn(async () => ["ba1"]) } as any,
      mockAudit() as any,
    );
    (svc as any).recalcOrder = mockFn(async () => {});
    (svc as any).syncBankTransactionMatchStatus = mockFn(async () => {});

    await svc.allocateSplitInternal({
      transactionId: txId,
      allocations: [
        { orderId: "o1", amount: 2700 },
        { orderId: "o2", amount: 1800 },
      ],
      actor: admin(),
    });

    assert.deepEqual(
      paymentCreate.calls.map((c) => c[0].data.amountUsd),
      [60, 36],
    );
  });
});

describe("PaymentsService.allocate order exchange rate", () => {
  it("stores UAH at the order rate in amountUsd", async () => {
    const txId = "tx1";
    const orderId = "o1";
    const paymentCreate = mockFn(async () => ({ id: "p-new" }));
    const tx = {
      id: txId,
      bankAccountId: "ba1",
      amount: 40040,
      currency: "UAH",
      bookedAt: new Date("2026-06-01T00:00:00.000Z"),
      payments: [] as unknown[],
      matchStatus: "UNMATCHED",
    };
    const prisma = {
      bankTransaction: { findUnique: mockFn(async () => tx) },
      order: {
        findUnique: mockFn(async () => ({
          id: orderId,
          ownerId: "a1",
          currency: "USD",
          exchangeRate: 45,
          totalAmount: 889.78,
          debtAmount: 889.78,
        })),
      },
      payment: { findMany: mockFn(async () => []) },
      $transaction: mockFn(async (fn: (db: any) => Promise<void>) =>
        fn({
          $queryRaw: async () => [],
          bankTransaction: { findUnique: async () => tx },
          payment: { create: paymentCreate },
        }),
      ),
    };
    const settings = { getExchangeRates: async () => ({ UAH_TO_USD: 1 / 47, EUR_TO_USD: 1.1 }) };
    const svc = new PaymentsService(
      prisma as any,
      settings as any,
      { getVisibleBankAccountIds: async () => ["ba1"] } as any,
      mockAudit() as any,
    );
    (svc as any).recalcOrder = mockFn(async () => {});
    (svc as any).syncBankTransactionMatchStatus = mockFn(async () => {});
    (svc as any).listByOrderId = mockFn(async () => []);

    await svc.allocate({ transactionId: txId, orderId }, admin());
    assert.equal(paymentCreate.calls[0][0].data.amountUsd, 889.78);
    assert.equal(paymentCreate.calls[0][0].data.amount, 40040);
    assert.equal(paymentCreate.calls[0][0].data.currency, "UAH");
  });
});
