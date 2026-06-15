import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { OrderReturnsService } from "../order-returns.service";

type PrismaSvc = import("../../prisma/prisma.service").PrismaService;
type IntegrationPorts = import("../../integration-ports/integration-ports.service").IntegrationPortsService;

function mockIntegrations(onRecalc?: (orderId: string) => void | Promise<void>) {
  return {
    recalcOrderFinance: async (orderId: string) => {
      await onRecalc?.(orderId);
    },
    getReturnSettlementPreview: async () => ({ requiresSettlement: false }),
    settleReturn: async () => ({}),
  } as unknown as IntegrationPorts;
}

describe("OrderReturnsService", () => {
  it("create sets order stage to RETURN_IN_PROGRESS", async () => {
    const orderUpdates: Array<Record<string, unknown>> = [];
    const prisma = {
      order: {
        findUnique: async () => ({
          id: "o1",
          ownerId: "u1",
          orderStage: "RECEIVED",
          subtotalAmount: 100,
          totalAmount: 100,
          paymentType: "POSTPAYMENT",
          paidAmount: 0,
          debtAmount: 100,
          paymentDueDate: null,
          items: [{ id: "i1", qty: 3, price: 100, lineTotal: 300 }],
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
        findMany: async () => [
          {
            items: [
              {
                qtyReturned: 2,
                orderItem: { qty: 3, lineTotal: 300, price: 100 },
              },
            ],
          },
        ],
      },
    } as unknown as PrismaSvc;

    const svc = new OrderReturnsService(prisma, mockIntegrations());

    await svc.create("o1", { items: [{ orderItemId: "i1", qtyReturned: 2 }] });

    assert.ok(orderUpdates.some((u) => u.orderStage === "RETURN_IN_PROGRESS"));
    // (300 / 3) * 2 * (100 / 100) = 200 — applied while return is still open
    assert.ok(orderUpdates.some((u) => u.returnAdjustmentAmount === 200));
  });

  it("closing return updates returnAdjustmentAmount and recalculates finance", async () => {
    const orderUpdates: Array<Record<string, unknown>> = [];
    let recalcCalled = false;

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
        findMany: async () => [
          {
            items: [
              {
                qtyReturned: 2,
                orderItem: { qty: 4, lineTotal: 400, price: 100 },
              },
            ],
          },
        ],
      },
      order: {
        findUnique: async () => ({
          subtotalAmount: 1000,
          totalAmount: 900,
          debtAmount: 500,
          paymentType: "POSTPAYMENT",
          paidAmount: 400,
          returnAdjustmentAmount: 0,
          paymentDueDate: null,
        }),
        update: async (args: { data: Record<string, unknown> }) => {
          orderUpdates.push(args.data);
          return {};
        },
      },
    } as unknown as PrismaSvc;

    const svc = new OrderReturnsService(
      prisma,
      mockIntegrations((orderId) => {
        recalcCalled = true;
        assert.equal(orderId, "o1");
      }),
    );

    await svc.updateStatus("r1", "CLOSED");

    assert.equal(recalcCalled, true);
    // (400 / 4) * 2 * (900 / 1000) = 180
    assert.ok(orderUpdates.some((u) => u.returnAdjustmentAmount === 180));
    assert.ok(orderUpdates.some((u) => u.orderStage === "RECEIVED"));
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
        findUnique: async () => ({
          subtotalAmount: 100,
          totalAmount: 100,
          debtAmount: 0,
          paymentType: "POSTPAYMENT",
          paidAmount: 100,
          returnAdjustmentAmount: 0,
          paymentDueDate: null,
        }),
        update: async (args: { data: Record<string, unknown> }) => {
          if (typeof args.data.orderStage === "string") stageUpdates.push(args.data.orderStage);
          return {};
        },
      },
    } as unknown as PrismaSvc;

    const svc = new OrderReturnsService(prisma, mockIntegrations());

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

    const svc = new OrderReturnsService(prisma, mockIntegrations());

    await assert.rejects(
      () => svc.create("o1", { items: [{ orderItemId: "i1", qtyReturned: 2 }] }),
      BadRequestException,
    );
    assert.equal(created, false);
  });
});
