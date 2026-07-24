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
  it("partial create keeps RECEIVED (does not set RETURN_IN_PROGRESS)", async () => {
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
                orderItemId: "i1",
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

    assert.ok(orderUpdates.some((u) => u.orderStage === "RECEIVED"));
    assert.ok(!orderUpdates.some((u) => u.orderStage === "RETURN_IN_PROGRESS"));
    // (300 / 3) * 2 * (100 / 100) = 200 — applied while return is still open
    assert.ok(orderUpdates.some((u) => u.returnAdjustmentAmount === 200));
  });

  it("full create sets order stage to RETURN_IN_PROGRESS", async () => {
    const orderUpdates: Array<Record<string, unknown>> = [];
    const prisma = {
      order: {
        findUnique: async () => ({
          id: "o1",
          ownerId: "u1",
          orderStage: "COMPLETED",
          subtotalAmount: 300,
          totalAmount: 300,
          paymentType: "POSTPAYMENT",
          paidAmount: 300,
          debtAmount: 0,
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
              items: [{ orderItemId: "i1", qtyReturned: 3 }],
            }),
          },
        }),
      orderReturn: {
        count: async () => 1,
        findMany: async () => [
          {
            items: [
              {
                orderItemId: "i1",
                qtyReturned: 3,
                orderItem: { qty: 3, lineTotal: 300, price: 100 },
              },
            ],
          },
        ],
      },
    } as unknown as PrismaSvc;

    const svc = new OrderReturnsService(prisma, mockIntegrations());

    await svc.create("o1", { items: [{ orderItemId: "i1", qtyReturned: 3 }] });

    assert.ok(orderUpdates.some((u) => u.orderStage === "RETURN_IN_PROGRESS"));
    assert.ok(orderUpdates.some((u) => u.deliveryStatus === "RETURN_TO_WAREHOUSE"));
  });

  it("closing last partial return sets stage RECEIVED when debt remains", async () => {
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
            status: "CLOSED",
            settledAt: new Date(),
            items: [
              {
                orderItemId: "i1",
                qtyReturned: 2,
                orderItem: { qty: 4, lineTotal: 400, price: 100 },
              },
            ],
          },
        ],
      },
      order: {
        findUnique: async () => ({
          orderStage: "RECEIVED",
          subtotalAmount: 1000,
          totalAmount: 900,
          debtAmount: 500,
          paymentType: "POSTPAYMENT",
          paidAmount: 400,
          returnAdjustmentAmount: 0,
          paymentDueDate: null,
          items: [{ id: "i1", qty: 4 }],
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
    assert.ok(!orderUpdates.some((u) => u.orderStage === "RETURN_IN_PROGRESS"));
    assert.ok(!orderUpdates.some((u) => u.orderStage === "FULLY_RETURNED"));
  });

  it("closing last return sets stage COMPLETED when debt is closed (no return qty)", async () => {
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
          orderStage: "RECEIVED",
          subtotalAmount: 100,
          totalAmount: 100,
          debtAmount: 0,
          paymentType: "POSTPAYMENT",
          paidAmount: 100,
          returnAdjustmentAmount: 0,
          paymentDueDate: null,
          items: [{ id: "i1", qty: 1 }],
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

  it("closing full return sets FULLY_RETURNED", async () => {
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
        findMany: async () => [
          {
            status: "CLOSED",
            settledAt: new Date(),
            items: [
              {
                orderItemId: "i1",
                qtyReturned: 3,
                orderItem: { qty: 3, lineTotal: 300, price: 100 },
              },
            ],
          },
        ],
      },
      order: {
        findUnique: async () => ({
          orderStage: "RETURN_IN_PROGRESS",
          subtotalAmount: 300,
          totalAmount: 300,
          debtAmount: 0,
          paymentType: "POSTPAYMENT",
          paidAmount: 0,
          returnAdjustmentAmount: 300,
          paymentDueDate: null,
          items: [{ id: "i1", qty: 3 }],
        }),
        update: async (args: { data: Record<string, unknown> }) => {
          if (typeof args.data.orderStage === "string") stageUpdates.push(args.data.orderStage);
          return {};
        },
      },
    } as unknown as PrismaSvc;

    const svc = new OrderReturnsService(prisma, mockIntegrations());

    await svc.updateStatus("r1", "CLOSED");
    assert.ok(stageUpdates.includes("FULLY_RETURNED"));
  });

  it("cumulative partial returns that become full set RETURN_IN_PROGRESS while open", async () => {
    const orderUpdates: Array<Record<string, unknown>> = [];
    const prisma = {
      order: {
        findUnique: async () => ({
          id: "o1",
          ownerId: "u1",
          orderStage: "RECEIVED",
          subtotalAmount: 300,
          totalAmount: 300,
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
        groupBy: async () => [{ orderItemId: "i1", _sum: { qtyReturned: 1 } }],
      },
      $transaction: async (cb: (tx: { orderReturn: { create: (args: unknown) => Promise<unknown> } }) => Promise<unknown>) =>
        cb({
          orderReturn: {
            create: async () => ({
              id: "r2",
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
                orderItemId: "i1",
                qtyReturned: 1,
                orderItem: { qty: 3, lineTotal: 300, price: 100 },
              },
            ],
          },
          {
            items: [
              {
                orderItemId: "i1",
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
  });

  it("closing cumulative partials that sum to full sets FULLY_RETURNED", async () => {
    const stageUpdates: string[] = [];
    const prisma = {
      orderReturn: {
        findUnique: async () => ({
          id: "r2",
          orderId: "o1",
          status: "REFUND_OR_ADJUSTMENT",
          order: { ownerId: "u1" },
          items: [],
        }),
        update: async () => ({ id: "r2", status: "CLOSED", orderId: "o1", items: [], order: {} }),
        count: async () => 0,
        findMany: async () => [
          {
            status: "CLOSED",
            settledAt: new Date(),
            items: [
              {
                orderItemId: "i1",
                qtyReturned: 1,
                orderItem: { qty: 3, lineTotal: 300, price: 100 },
              },
            ],
          },
          {
            status: "CLOSED",
            settledAt: new Date(),
            items: [
              {
                orderItemId: "i1",
                qtyReturned: 2,
                orderItem: { qty: 3, lineTotal: 300, price: 100 },
              },
            ],
          },
        ],
      },
      order: {
        findUnique: async () => ({
          orderStage: "RETURN_IN_PROGRESS",
          subtotalAmount: 300,
          totalAmount: 300,
          debtAmount: 0,
          paymentType: "POSTPAYMENT",
          paidAmount: 0,
          returnAdjustmentAmount: 300,
          paymentDueDate: null,
          items: [{ id: "i1", qty: 3 }],
        }),
        update: async (args: { data: Record<string, unknown> }) => {
          if (typeof args.data.orderStage === "string") stageUpdates.push(args.data.orderStage);
          return {};
        },
      },
    } as unknown as PrismaSvc;

    const svc = new OrderReturnsService(prisma, mockIntegrations());

    await svc.updateStatus("r2", "CLOSED");
    assert.ok(stageUpdates.includes("FULLY_RETURNED"));
  });

  it("list filters by status and pageSize", async () => {
    const findManyArgs: Array<Record<string, unknown>> = [];
    const countArgs: Array<Record<string, unknown>> = [];
    const prisma = {
      orderReturn: {
        findMany: async (args: Record<string, unknown>) => {
          findManyArgs.push(args);
          return [{ id: "r1", status: "REQUESTED", order: {}, items: [] }];
        },
        count: async (args: Record<string, unknown>) => {
          countArgs.push(args);
          return 3;
        },
      },
    } as unknown as PrismaSvc;

    const svc = new OrderReturnsService(prisma, mockIntegrations());
    const result = await svc.list({ status: "REQUESTED" as never, page: 1, pageSize: 3 });

    assert.equal(result.pageSize, 3);
    assert.equal(result.total, 3);
    assert.equal(result.items.length, 1);
    assert.deepEqual(findManyArgs[0]?.where, { status: "REQUESTED" });
    assert.equal(findManyArgs[0]?.take, 3);
    assert.equal(findManyArgs[0]?.skip, 0);
    assert.deepEqual(countArgs[0]?.where, { status: "REQUESTED" });
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
