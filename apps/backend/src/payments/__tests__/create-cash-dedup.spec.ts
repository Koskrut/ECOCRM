import assert from "node:assert/strict";
import { describe, it } from "node:test";
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

describe("PaymentsService.createCash dedup", () => {
  const paidAt = new Date("2026-06-01T12:00:00.000Z");
  const dto = {
    orderId: "o1",
    amount: 500,
    currency: "UAH",
    paidAt: paidAt.toISOString(),
  };

  it("returns existing order payments when duplicate cash payment detected", async () => {
    const paymentCreate = mockFn();
    const findFirst = mockFn(async () => ({
      id: "existing",
      orderId: "o1",
      amount: 500,
      currency: "UAH",
      paidAt,
      status: PaymentStatus.COMPLETED,
      sourceType: PaymentSourceType.CASH,
    }));
    const findMany = mockFn(async () => [{ id: "existing", amount: 500, currency: "UAH", amountUsd: 12 }]);
    const prisma = {
      order: {
        findUnique: mockFn(async () => ({ id: "o1", ownerId: "m1", currency: "UAH" })),
      },
      payment: { findFirst, create: paymentCreate, findMany },
    };
    const settings = { getExchangeRates: async () => ({ UAH_TO_USD: 0.024 }) };
    const svc = new PaymentsService(prisma as any, settings as any, {} as any);

    const result = await svc.createCash(dto, manager());
    assert.equal(paymentCreate.calls.length, 0);
    assert.equal(findFirst.calls.length, 1);
    assert.ok(Array.isArray(result));
  });

  it("creates payment when no duplicate exists", async () => {
    const paymentCreate = mockFn(async () => ({ id: "p-new" }));
    const prisma = {
      order: {
        findUnique: mockFn(async () => ({ id: "o1", ownerId: "m1", currency: "UAH" })),
        update: mockFn(async () => ({})),
      },
      payment: {
        findFirst: mockFn(async () => null),
        create: paymentCreate,
        findMany: mockFn(async () => []),
      },
    };
    const settings = { getExchangeRates: async () => ({ UAH_TO_USD: 0.024 }) };
    const svc = new PaymentsService(prisma as any, settings as any, {} as any);

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
    const bankAccounts = { getVisibleBankAccountIds: mockFn(async () => ["ba1"]) };
    const svc = new PaymentsService(prisma as any, settings as any, bankAccounts as any);

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
    const bankAccounts = { getVisibleBankAccountIds: mockFn(async () => ["ba1"]) };
    const svc = new PaymentsService(prisma as any, settings as any, bankAccounts as any);

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
});
