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

function admin(): AuthUser {
  return { id: "a1", email: "a@t.com", fullName: "Admin", role: UserRole.ADMIN };
}

function manager(): AuthUser {
  return { id: "m1", email: "m@t.com", fullName: "Manager", role: UserRole.MANAGER };
}

function mockAudit() {
  return {
    write: mockFn(async () => ({})),
    buildUpdatePayload: (input: unknown) => input,
  };
}

describe("PaymentsService.deleteCashPayment", () => {
  function buildService(opts?: { sourceType?: PaymentSourceType }) {
    const sourceType = opts?.sourceType ?? PaymentSourceType.CASH;
    const paymentDelete = mockFn(async () => ({}));
    const orderUpdate = mockFn(async () => ({}));
    const recalcCalls: string[] = [];
    const prisma = {
      payment: {
        findUnique: mockFn(async () => ({
          id: "p1",
          orderId: "o1",
          sourceType,
          amount: 500,
          currency: "UAH",
          amountUsd: 12,
          order: { id: "o1", orderNumber: "7001" },
        })),
        delete: paymentDelete,
        findMany: mockFn(async () => []),
      },
      order: {
        findUnique: mockFn(async () => ({
          id: "o1",
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
        update: orderUpdate,
      },
    };
    const settings = { getExchangeRates: async () => ({ UAH_TO_USD: 0.024, EUR_TO_USD: 1.05 }) };
    const audit = mockAudit();
    const svc = new PaymentsService(prisma as any, settings as any, {} as any, audit as any);
    const origRecalc = svc.recalcOrder.bind(svc);
    svc.recalcOrder = async (orderId: string) => {
      recalcCalls.push(orderId);
      return origRecalc(orderId);
    };
    return { svc, paymentDelete, recalcCalls, audit };
  }

  it("allows ADMIN to delete CASH payment and recalc order", async () => {
    const { svc, paymentDelete, recalcCalls, audit } = buildService();
    const result = await svc.deleteCashPayment("p1", admin());
    assert.equal(paymentDelete.calls.length, 1);
    assert.deepEqual(recalcCalls, ["o1"]);
    assert.equal(result.ok, true);
    assert.equal(audit.write.calls.length, 1);
  });

  it("rejects MANAGER delete", async () => {
    const { svc } = buildService();
    await assert.rejects(() => svc.deleteCashPayment("p1", manager()), ForbiddenException);
  });

  it("rejects delete of bank payment", async () => {
    const { svc } = buildService({ sourceType: PaymentSourceType.BANK });
    await assert.rejects(() => svc.deleteCashPayment("p1", admin()), BadRequestException);
  });
});
