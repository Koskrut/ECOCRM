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
    return impl ? impl(...args, fn) : undefined;
  }) as AnyFn & { calls: any[][] };
  fn.calls = [];
  return fn;
}

function manager(id = "m1"): AuthUser {
  return { id, email: `${id}@t.com`, fullName: id, role: UserRole.MANAGER };
}

function mockAudit() {
  return {
    write: mockFn(async () => ({})),
    buildUpdatePayload: (input: unknown) => input,
  };
}

describe("PaymentsService.createCash split allocations", () => {
  const paidAt = new Date("2026-06-01T12:00:00.000Z");

  it("creates multiple CASH rows when allocations provided", async () => {
    const paymentCreate = mockFn(async () => ({ id: "p-new" }));
    const recalcOrderIds: string[] = [];
    const prisma = {
      order: {
        findUnique: mockFn(async (args: { where: { id: string } }) => {
          const id = args.where.id;
          if (id === "o1") {
            return { id: "o1", ownerId: "m1", currency: "UAH", clientId: "c1", contactId: null };
          }
          if (id === "o2") {
            return { id: "o2", ownerId: "m1", currency: "UAH", clientId: "c1", contactId: null };
          }
          return null;
        }),
        update: mockFn(async () => ({})),
      },
      payment: {
        findFirst: mockFn(async () => null),
        create: paymentCreate,
        findMany: mockFn(async () => []),
      },
    };
    const settings = { getExchangeRates: async () => ({ UAH_TO_USD: 0.024 }) };
    const audit = mockAudit();
    const svc = new PaymentsService(prisma as any, settings as any, {} as any, audit as any);
    (svc as any).recalcOrder = mockFn(async (oid: string) => {
      recalcOrderIds.push(oid);
    });

    await svc.createCash(
      {
        orderId: "o1",
        amount: 1000,
        currency: "UAH",
        paidAt: paidAt.toISOString(),
        allocations: [
          { orderId: "o1", amount: 600 },
          { orderId: "o2", amount: 400 },
        ],
      },
      manager(),
    );

    assert.equal(paymentCreate.calls.length, 2);
    assert.deepEqual(
      paymentCreate.calls.map((c) => c[0].data.orderId),
      ["o1", "o2"],
    );
    assert.deepEqual(recalcOrderIds.sort(), ["o1", "o2"]);
  });

  it("rejects allocations from different clients", async () => {
    const prisma = {
      order: {
        findUnique: mockFn(async (args: { where: { id: string } }) => {
          const id = args.where.id;
          if (id === "o1") {
            return { id: "o1", ownerId: "m1", currency: "UAH", clientId: "c1", contactId: null };
          }
          if (id === "o2") {
            return { id: "o2", ownerId: "m1", currency: "UAH", clientId: "c2", contactId: null };
          }
          return null;
        }),
      },
      payment: { findFirst: mockFn(async () => null) },
    };
    const settings = { getExchangeRates: async () => ({ UAH_TO_USD: 0.024 }) };
    const audit = mockAudit();
    const svc = new PaymentsService(prisma as any, settings as any, {} as any, audit as any);

    await assert.rejects(
      () =>
        svc.createCash(
          {
            orderId: "o1",
            amount: 1000,
            currency: "UAH",
            paidAt: paidAt.toISOString(),
            allocations: [
              { orderId: "o1", amount: 500 },
              { orderId: "o2", amount: 500 },
            ],
          },
          manager(),
        ),
      /same client/,
    );
  });

  it("rejects when allocation total does not match payment amount", async () => {
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
      payment: { findFirst: mockFn(async () => null) },
    };
    const settings = { getExchangeRates: async () => ({ UAH_TO_USD: 0.024 }) };
    const audit = mockAudit();
    const svc = new PaymentsService(prisma as any, settings as any, {} as any, audit as any);

    await assert.rejects(
      () =>
        svc.createCash(
          {
            orderId: "o1",
            amount: 1000,
            currency: "UAH",
            paidAt: paidAt.toISOString(),
            allocations: [{ orderId: "o1", amount: 900 }],
          },
          manager(),
        ),
      /must equal payment amount/,
    );
  });
});

describe("PaymentsService.createCash dedup 409", () => {
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
      payment: { findFirst, create: paymentCreate, findMany: mockFn(async () => []) },
    };
    const settings = { getExchangeRates: async () => ({ UAH_TO_USD: 0.024 }) };
    const audit = mockAudit();
    const svc = new PaymentsService(prisma as any, settings as any, {} as any, audit as any);

    await assert.rejects(() => svc.createCash(dto, manager()), ConflictException);
    assert.equal(paymentCreate.calls.length, 0);
    assert.equal(findFirst.calls.length, 1);
  });

  it("allows the same amount on a different order of the same client", async () => {
    const paymentCreate = mockFn(async () => ({ id: "p-new" }));
    const findFirst = mockFn(async (args: { where?: { OR?: Array<{ orderId?: string }> } }) => {
      const or = args.where?.OR ?? [];
      const looksAtO2 = or.some((f) => f.orderId === "o2");
      if (looksAtO2) return null;
      return {
        id: "existing",
        orderId: "o1",
        amount: 40,
        currency: "USD",
        paidAt,
        status: PaymentStatus.COMPLETED,
        sourceType: PaymentSourceType.CASH,
        order: { orderNumber: "ORD-1" },
        createdBy: { fullName: "Manager" },
      };
    });
    const prisma = {
      order: {
        findUnique: mockFn(async (args: { where: { id: string } }) => ({
          id: args.where.id,
          ownerId: "m1",
          currency: "USD",
          clientId: "c1",
          contactId: null,
        })),
        update: mockFn(async () => ({})),
      },
      payment: { findFirst, create: paymentCreate, findMany: mockFn(async () => []) },
    };
    const settings = { getExchangeRates: async () => ({ UAH_TO_USD: 0.024 }) };
    const audit = mockAudit();
    const svc = new PaymentsService(prisma as any, settings as any, {} as any, audit as any);
    (svc as any).recalcOrder = mockFn(async () => {});

    await svc.createCash(
      {
        orderId: "o2",
        amount: 40,
        currency: "USD",
        paidAt: paidAt.toISOString(),
      },
      manager(),
    );
    assert.equal(paymentCreate.calls.length, 1);
    const orFilter = findFirst.calls[0]?.[0]?.where?.OR as Array<{ orderId?: string }>;
    assert.deepEqual(orFilter, [{ orderId: "o2", amount: 40 }]);
  });

  it("creates payment when confirmDuplicate is true", async () => {
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
        findFirst: mockFn(async () => ({
          id: "existing",
          orderId: "o1",
          amount: 500,
          currency: "UAH",
          paidAt,
          status: PaymentStatus.COMPLETED,
          sourceType: PaymentSourceType.CASH,
          order: { orderNumber: "ORD-1" },
          createdBy: { fullName: "Manager" },
        })),
        create: paymentCreate,
        findMany: mockFn(async () => []),
      },
    };
    const settings = { getExchangeRates: async () => ({ UAH_TO_USD: 0.024 }) };
    const audit = mockAudit();
    const svc = new PaymentsService(prisma as any, settings as any, {} as any, audit as any);
    (svc as any).recalcOrder = mockFn(async () => {});

    await svc.createCash({ ...dto, confirmDuplicate: true }, manager());
    assert.equal(paymentCreate.calls.length, 1);
  });
});
