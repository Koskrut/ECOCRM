import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
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

describe("PaymentsService.transferCredit", () => {
  it("rejects different clients", async () => {
    const prisma = {
      order: {
        findUnique: mockFn(async ({ where }: { where: { id: string } }) => {
          if (where.id === "from") {
            return {
              id: "from",
              ownerId: "m1",
              clientId: "c1",
              contactId: "c1",
              companyId: null,
              currency: "USD",
              orderNumber: "1001",
              creditAmount: 300,
              debtAmount: 0,
            };
          }
          return {
            id: "to",
            ownerId: "m1",
            clientId: "c2",
            contactId: "c2",
            companyId: null,
            currency: "USD",
            orderNumber: "1002",
            creditAmount: 0,
            debtAmount: 200,
          };
        }),
      },
      $transaction: mockFn(),
      payment: { create: mockFn(), findMany: mockFn(async () => []) },
    };
    const settings = { getExchangeRates: async () => ({ UAH_TO_USD: 0.024, EUR_TO_USD: 1.05 }) };
    const svc = new PaymentsService(prisma as any, settings as any, {} as any);

    await assert.rejects(
      () =>
        svc.transferCredit(
          { fromOrderId: "from", toOrderId: "to", amount: 100 },
          manager(),
        ),
      BadRequestException,
    );
  });

  it("rejects amount above credit or debt", async () => {
    const orders: Record<string, any> = {
      from: {
        id: "from",
        ownerId: "m1",
        clientId: "c1",
        contactId: "c1",
        companyId: null,
        currency: "USD",
        orderNumber: "1001",
        creditAmount: 100,
        debtAmount: 0,
      },
      to: {
        id: "to",
        ownerId: "m1",
        clientId: "c1",
        contactId: "c1",
        companyId: null,
        currency: "USD",
        orderNumber: "1002",
        creditAmount: 0,
        debtAmount: 50,
      },
    };
    const prisma = {
      order: {
        findUnique: mockFn(async ({ where }: { where: { id: string } }) => orders[where.id]),
        update: mockFn(async () => ({})),
      },
      $transaction: mockFn(),
      payment: { create: mockFn(), findMany: mockFn(async () => []) },
    };
    const settings = { getExchangeRates: async () => ({ UAH_TO_USD: 0.024, EUR_TO_USD: 1.05 }) };
    const svc = new PaymentsService(prisma as any, settings as any, {} as any);

    await assert.rejects(
      () =>
        svc.transferCredit(
          { fromOrderId: "from", toOrderId: "to", amount: 80 },
          manager(),
        ),
      (e: unknown) => e instanceof BadRequestException && String(e).includes("debt"),
    );
    await assert.rejects(
      () =>
        svc.transferCredit(
          { fromOrderId: "from", toOrderId: "to", amount: 150 },
          manager(),
        ),
      (e: unknown) => e instanceof BadRequestException && String(e).includes("credit"),
    );
  });

  it("creates paired CREDIT_TRANSFER payments and recalcs both orders", async () => {
    const orders: Record<string, any> = {
      from: {
        id: "from",
        ownerId: "m1",
        clientId: "c1",
        contactId: "c1",
        companyId: null,
        currency: "USD",
        orderNumber: "1001",
        creditAmount: 300,
        debtAmount: 0,
        totalAmount: 1000,
        subtotalAmount: 1000,
        returnAdjustmentAmount: 300,
        fxWriteOffAmount: 0,
        paymentType: "POSTPAYMENT",
        paymentDueDate: null,
        orderStage: "COMPLETED",
        paidAmount: 1000,
      },
      to: {
        id: "to",
        ownerId: "m1",
        clientId: "c1",
        contactId: "c1",
        companyId: null,
        currency: "USD",
        orderNumber: "1002",
        creditAmount: 0,
        debtAmount: 200,
        totalAmount: 500,
        subtotalAmount: 500,
        returnAdjustmentAmount: 0,
        fxWriteOffAmount: 0,
        paymentType: "POSTPAYMENT",
        paymentDueDate: null,
        orderStage: "CONFIRMED",
        paidAmount: 300,
      },
    };

    const createdPayments: any[] = [];
    const paymentsByOrder: Record<string, any[]> = {
      from: [{ amount: 1000, currency: "USD", amountUsd: 1000 }],
      to: [{ amount: 300, currency: "USD", amountUsd: 300 }],
    };
    const orderUpdates: Record<string, any> = {};

    const prisma = {
      order: {
        findUnique: mockFn(async ({ where, select }: any) => {
          const o = orders[where.id];
          if (!o) return null;
          // Post-transfer summary select has orderNumber but not ownerId/clientId.
          if (select?.orderNumber && !select?.ownerId) {
            return {
              id: o.id,
              orderNumber: o.orderNumber,
              paidAmount: o.paidAmount,
              debtAmount: o.debtAmount,
              creditAmount: o.creditAmount,
            };
          }
          return o;
        }),
        update: mockFn(async ({ where, data }: any) => {
          orderUpdates[where.id] = data;
          Object.assign(orders[where.id], data);
          return orders[where.id];
        }),
      },
      payment: {
        create: mockFn(async ({ data }: any) => {
          createdPayments.push(data);
          const list = paymentsByOrder[data.orderId] ?? [];
          list.push({
            amount: Number(data.amount),
            currency: data.currency,
            amountUsd: Number(data.amountUsd),
          });
          paymentsByOrder[data.orderId] = list;
          return { id: `p-${createdPayments.length}`, ...data };
        }),
        findMany: mockFn(async ({ where }: any) => paymentsByOrder[where.orderId] ?? []),
      },
      $transaction: mockFn(async (cb: any) =>
        cb({
          payment: {
            create: async ({ data }: any) => {
              createdPayments.push(data);
              const list = paymentsByOrder[data.orderId] ?? [];
              list.push({
                amount: Number(data.amount),
                currency: data.currency,
                amountUsd: Number(data.amountUsd),
              });
              paymentsByOrder[data.orderId] = list;
              return { id: `p-${createdPayments.length}`, ...data };
            },
          },
        }),
      ),
    };

    const settings = { getExchangeRates: async () => ({ UAH_TO_USD: 0.024, EUR_TO_USD: 1.05 }) };
    const svc = new PaymentsService(prisma as any, settings as any, {} as any);

    const result = await svc.transferCredit(
      { fromOrderId: "from", toOrderId: "to", amount: 200 },
      manager(),
    );

    assert.equal(createdPayments.length, 2);
    assert.equal(createdPayments[0].sourceType, "CREDIT_TRANSFER");
    assert.equal(Number(createdPayments[0].amount), -200);
    assert.equal(createdPayments[0].orderId, "from");
    assert.equal(createdPayments[0].linkedOrderId, "to");
    assert.equal(Number(createdPayments[1].amount), 200);
    assert.equal(createdPayments[1].orderId, "to");
    assert.equal(createdPayments[0].transferGroupId, createdPayments[1].transferGroupId);

    assert.equal(orderUpdates.from.creditAmount, 100); // 1000-200 paid vs 700 effective
    assert.equal(orderUpdates.from.debtAmount, 0);
    assert.equal(orderUpdates.to.debtAmount, 0); // 500 - 500 paid
    assert.equal(orderUpdates.to.creditAmount, 0);
    assert.ok(result.transferGroupId);
  });

  it("recalcOrder sets creditAmount after return overpay", async () => {
    const prisma = {
      payment: {
        findMany: mockFn(async () => [
          { amount: 1000, currency: "USD", amountUsd: 1000 },
        ]),
      },
      order: {
        findUnique: mockFn(async () => ({
          totalAmount: 1000,
          subtotalAmount: 1000,
          paidAmount: 1000,
          returnAdjustmentAmount: 300,
          fxWriteOffAmount: 0,
          paymentType: "POSTPAYMENT",
          paymentDueDate: null,
          orderStage: "COMPLETED",
          debtAmount: 0,
        })),
        update: mockFn(async ({ data }: any) => data),
      },
    };
    const settings = { getExchangeRates: async () => ({ UAH_TO_USD: 0.024, EUR_TO_USD: 1.05 }) };
    const svc = new PaymentsService(prisma as any, settings as any, {} as any);
    await svc.recalcOrder("o1");
    const update = (prisma.order.update as any).calls[0][0].data;
    assert.equal(update.creditAmount, 300);
    assert.equal(update.debtAmount, 0);
    assert.equal(update.paidAmount, 1000);
  });

  it("forbids manager transferring foreign orders", async () => {
    const prisma = {
      order: {
        findUnique: mockFn(async ({ where }: { where: { id: string } }) => ({
          id: where.id,
          ownerId: where.id === "from" ? "other" : "m1",
          clientId: "c1",
          contactId: "c1",
          companyId: null,
          currency: "USD",
          orderNumber: "1",
          creditAmount: 100,
          debtAmount: where.id === "to" ? 50 : 0,
        })),
      },
    };
    const svc = new PaymentsService(prisma as any, {} as any, {} as any);
    await assert.rejects(
      () =>
        svc.transferCredit(
          { fromOrderId: "from", toOrderId: "to", amount: 50 },
          manager(),
        ),
      ForbiddenException,
    );
  });

  it("allows admin without ownership check", async () => {
    const orders: Record<string, any> = {
      from: {
        id: "from",
        ownerId: "x",
        clientId: "c1",
        contactId: "c1",
        companyId: null,
        currency: "USD",
        orderNumber: "1",
        creditAmount: 50,
        debtAmount: 0,
        totalAmount: 100,
        subtotalAmount: 100,
        returnAdjustmentAmount: 50,
        fxWriteOffAmount: 0,
        paymentType: "POSTPAYMENT",
        paymentDueDate: null,
        orderStage: "COMPLETED",
        paidAmount: 150,
      },
      to: {
        id: "to",
        ownerId: "y",
        clientId: "c1",
        contactId: "c1",
        companyId: null,
        currency: "USD",
        orderNumber: "2",
        creditAmount: 0,
        debtAmount: 50,
        totalAmount: 100,
        subtotalAmount: 100,
        returnAdjustmentAmount: 0,
        fxWriteOffAmount: 0,
        paymentType: "POSTPAYMENT",
        paymentDueDate: null,
        orderStage: "CONFIRMED",
        paidAmount: 50,
      },
    };
    const paymentsByOrder: Record<string, any[]> = {
      from: [{ amount: 150, currency: "USD", amountUsd: 150 }],
      to: [{ amount: 50, currency: "USD", amountUsd: 50 }],
    };
    const prisma = {
      order: {
        findUnique: mockFn(async ({ where }: any) => orders[where.id]),
        update: mockFn(async ({ where, data }: any) => {
          Object.assign(orders[where.id], data);
          return orders[where.id];
        }),
      },
      payment: {
        findMany: mockFn(async ({ where }: any) => paymentsByOrder[where.orderId] ?? []),
      },
      $transaction: mockFn(async (cb: any) =>
        cb({
          payment: {
            create: async ({ data }: any) => {
              const list = paymentsByOrder[data.orderId] ?? [];
              list.push({
                amount: Number(data.amount),
                currency: data.currency,
                amountUsd: Number(data.amountUsd),
              });
              paymentsByOrder[data.orderId] = list;
              return data;
            },
          },
        }),
      ),
    };
    const settings = { getExchangeRates: async () => ({ UAH_TO_USD: 0.024, EUR_TO_USD: 1.05 }) };
    const svc = new PaymentsService(prisma as any, settings as any, {} as any);
    const result = await svc.transferCredit(
      { fromOrderId: "from", toOrderId: "to", amount: 50 },
      admin(),
    );
    assert.ok(result.transferGroupId);
  });
});
