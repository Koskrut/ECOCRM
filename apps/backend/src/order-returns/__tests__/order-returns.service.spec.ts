import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { OrderReturnsService } from "../order-returns.service";

type PrismaSvc = import("../../prisma/prisma.service").PrismaService;
type PaymentsSvc = import("../../payments/payments.service").PaymentsService;

describe("OrderReturnsService", () => {
  it("create sets order stage to RETURN_IN_PROGRESS", async () => {
    const orderUpdates: Array<Record<string, unknown>> = [];
    const prisma = {
      order: {
        findUnique: async () => ({
          id: "o1",
          ownerId: "u1",
          orderStage: "RECEIVED",
          paymentType: "POSTPAYMENT",
          totalAmount: 100,
          paidAmount: 0,
          debtAmount: 100,
          paymentDueDate: null,
          items: [{ id: "i1", qty: 3 }],
          company: null,
          client: null,
        }),
        update: async (args: { data: Record<string, unknown> }) => {
          orderUpdates.push(args.data);
          return {};
        },
      },
      orderReturnItem: {
        groupBy: async () => [],
      },
      $transaction: async (cb: (tx: { orderReturn: { create: (args: unknown) => Promise<unknown> } }) => Promise<unknown>) =>
        cb({
          orderReturn: {
            create: async () => ({
              id: "r1",
              status: "REQUESTED",
              order: { id: "o1", orderNumber: "1001" },
              items: [{ orderItemId: "i1", qtyReturned: 2 }],
            }),
          },
        }),
      orderReturn: {
        count: async () => 1,
        findMany: async () => [],
      },
    } as unknown as PrismaSvc;
    const payments = {
      recalcOrder: async () => {},
    } as unknown as PaymentsSvc;
    const svc = new OrderReturnsService(prisma, payments);

    await svc.create("o1", { items: [{ orderItemId: "i1", qtyReturned: 2 }] });

    assert.ok(orderUpdates.some((u) => u.orderStage === "RETURN_IN_PROGRESS"));
  });

  it("closing last return sets stage by debt (RECEIVED/COMPLETED)", async () => {
    const stageUpdates: string[] = [];
    const prisma = {
      orderReturn: {
        findUnique: async () => ({
          id: "r1",
          orderId: "o1",
          status: "REFUND_OR_ADJUSTMENT",
          order: { ownerId: "u1" },
          items: [],
        }),
        update: async () => ({ id: "r1", status: "CLOSED", orderId: "o1", items: [], order: {} }),
        count: async () => 0,
        findMany: async () => [],
      },
      order: {
        update: async (args: { data: Record<string, unknown> }) => {
          if (typeof args.data.orderStage === "string") stageUpdates.push(args.data.orderStage);
          return {};
        },
        findUnique: async () => ({
          debtAmount: 10,
          paymentType: "POSTPAYMENT",
          totalAmount: 100,
          paidAmount: 90,
          returnAdjustmentAmount: 0,
          paymentDueDate: null,
        }),
      },
    } as unknown as PrismaSvc;
    const payments = {
      recalcOrder: async () => {},
    } as unknown as PaymentsSvc;
    const svc = new OrderReturnsService(prisma, payments);

    await svc.updateStatus("r1", "CLOSED");
    assert.ok(stageUpdates.includes("RECEIVED"));
  });

  it("closing last return sets stage COMPLETED when debt is closed", async () => {
    const stageUpdates: string[] = [];
    const prisma = {
      orderReturn: {
        findUnique: async () => ({
          id: "r1",
          orderId: "o1",
          status: "REFUND_OR_ADJUSTMENT",
          order: { ownerId: "u1" },
          items: [],
        }),
        update: async () => ({ id: "r1", status: "CLOSED", orderId: "o1", items: [], order: {} }),
        count: async () => 0,
        findMany: async () => [],
      },
      order: {
        update: async (args: { data: Record<string, unknown> }) => {
          if (typeof args.data.orderStage === "string") stageUpdates.push(args.data.orderStage);
          return {};
        },
        findUnique: async () => ({
          debtAmount: 0,
          paymentType: "POSTPAYMENT",
          totalAmount: 100,
          paidAmount: 100,
          returnAdjustmentAmount: 0,
          paymentDueDate: null,
        }),
      },
    } as unknown as PrismaSvc;
    const payments = {
      recalcOrder: async () => {},
    } as unknown as PaymentsSvc;
    const svc = new OrderReturnsService(prisma, payments);

    await svc.updateStatus("r1", "CLOSED");
    assert.ok(stageUpdates.includes("COMPLETED"));
  });

  it("create rejects over-return considering previous returns", async () => {
    let created = false;
    const prisma = {
      order: {
        findUnique: async () => ({
          id: "o1",
          ownerId: "u1",
          orderStage: "RECEIVED",
          items: [{ id: "i1", qty: 5 }],
          company: null,
          client: null,
        }),
      },
      orderReturnItem: {
        groupBy: async () => [{ orderItemId: "i1", _sum: { qtyReturned: 4 } }],
      },
      $transaction: async () => {
        created = true;
        return {};
      },
    } as unknown as PrismaSvc;
    const payments = {} as PaymentsSvc;
    const svc = new OrderReturnsService(prisma, payments);

    await assert.rejects(
      () => svc.create("o1", { items: [{ orderItemId: "i1", qtyReturned: 2 }] }),
      BadRequestException,
    );
    assert.equal(created, false);
  });
});
