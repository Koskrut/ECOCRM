import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { PaymentSourceType, UserRole } from "@prisma/client";
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

describe("PaymentsService.update cash", () => {
  function buildService(opts?: { ownerId?: string; sourceType?: PaymentSourceType }) {
    const ownerId = opts?.ownerId ?? "m1";
    const sourceType = opts?.sourceType ?? PaymentSourceType.CASH;
    const paymentUpdate = mockFn(async () => ({}));
    const prisma = {
      payment: {
        findUnique: mockFn(async () => ({
          id: "p1",
          orderId: "o1",
          sourceType,
          amount: 1000,
          currency: "USD",
          amountUsd: 1000,
          order: { id: "o1", ownerId },
        })),
        update: paymentUpdate,
        findMany: mockFn(async () => [
          { amount: 1000, currency: "UAH", amountUsd: 24 },
        ]),
      },
      order: {
        findUnique: mockFn(async () => ({
          id: "o1",
          ownerId,
          totalAmount: 100,
          subtotalAmount: 100,
          paidAmount: 0,
          returnAdjustmentAmount: 0,
          fxWriteOffAmount: 0,
          paymentType: "PREPAY",
          paymentDueDate: null,
          orderStage: null,
          debtAmount: 100,
        })),
        update: mockFn(async () => ({})),
      },
    };
    const settings = {
      getExchangeRates: async () => ({ UAH_TO_USD: 0.024, EUR_TO_USD: 1.05 }),
    };
    const svc = new PaymentsService(prisma as any, settings as any, {} as any);
    return { svc, paymentUpdate, prisma };
  }

  it("allows manager to change amount and currency on own order", async () => {
    const { svc, paymentUpdate } = buildService();
    await svc.update("p1", { amount: 1000, currency: "UAH" }, manager());
    assert.equal(paymentUpdate.calls.length, 1);
    const data = paymentUpdate.calls[0][0].data;
    assert.equal(data.amount, 1000);
    assert.equal(data.currency, "UAH");
    assert.equal(data.amountUsd, 24);
  });

  it("rejects manager editing another manager's order", async () => {
    const { svc } = buildService({ ownerId: "other" });
    await assert.rejects(
      () => svc.update("p1", { amount: 500 }, manager()),
      ForbiddenException,
    );
  });

  it("rejects amount change on bank payments", async () => {
    const { svc } = buildService({ sourceType: PaymentSourceType.BANK });
    await assert.rejects(
      () => svc.update("p1", { amount: 500 }, manager()),
      BadRequestException,
    );
  });
});
