import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { OrdersService } from "../orders.service";

type PrismaSvc = import("../../prisma/prisma.service").PrismaService;
type WarehousesSvc = import("../../warehouses/warehouses.service").WarehousesService;
type SettingsSvc = import("../../settings/settings.service").SettingsService;
type GoogleSheetSvc =
  import("../../integrations/google-sheet/google-sheet-send-order.service").GoogleSheetSendOrderService;
type PipelineSvc = import("../pipeline/orders-pipeline-config.service").OrdersPipelineConfigService;

describe("OrdersService.setOrderStage", () => {
  it("rejects stage change from NEW when contact has no Код1с", async () => {
    const prisma = {
      order: {
        findUnique: async () => ({
          id: "o1",
          ownerId: "u1",
          contactId: "c1",
          contact: { externalCode: null },
          orderStage: "NEW",
          status: "NEW",
          paymentType: "POSTPAYMENT",
          paidAmount: 0,
          totalAmount: 100,
          debtAmount: 100,
          paymentDueDate: null,
        }),
      },
    } as unknown as PrismaSvc;
    const warehouses = {} as WarehousesSvc;
    const settings = {} as SettingsSvc;
    const googleSheet = {} as GoogleSheetSvc;
    const pipeline = {
      getEffectiveTransitionGraph: async () => ({
        NEW: ["CONFIRMED"],
        CONFIRMED: [],
        AWAITING_PAYMENT: [],
        AWAITING_STOCK: [],
        READY_TO_SHIP: [],
        SHIPPED: [],
        AWAITING_RECEIPT: [],
        RECEIVED: [],
        COMPLETED: [],
        CANCELED: [],
        REFUSED: [],
        RETURN_IN_PROGRESS: [],
        FULLY_RETURNED: [],
      }),
    } as unknown as PipelineSvc;
    const svc = new OrdersService(prisma, warehouses, settings, googleSheet, pipeline);

    await assert.rejects(
      () => svc.setOrderStage("o1", "CONFIRMED", undefined),
      BadRequestException,
    );
  });

  it("rejects stage change when orderStage is null and contact has no Код1с", async () => {
    const prisma = {
      order: {
        findUnique: async () => ({
          id: "o1",
          ownerId: "u1",
          contactId: "c1",
          contact: { externalCode: null },
          orderStage: null,
          status: "NEW",
          paymentType: "POSTPAYMENT",
          paidAmount: 0,
          totalAmount: 100,
          debtAmount: 100,
          paymentDueDate: null,
        }),
      },
    } as unknown as PrismaSvc;
    const pipeline = {
      getEffectiveTransitionGraph: async () => ({
        NEW: ["CONFIRMED"],
        CONFIRMED: [],
        AWAITING_PAYMENT: [],
        AWAITING_STOCK: [],
        READY_TO_SHIP: [],
        SHIPPED: [],
        AWAITING_RECEIPT: [],
        RECEIVED: [],
        COMPLETED: [],
        CANCELED: [],
        REFUSED: [],
        RETURN_IN_PROGRESS: [],
        FULLY_RETURNED: [],
      }),
    } as unknown as PipelineSvc;
    const svc = new OrdersService(
      prisma,
      {} as WarehousesSvc,
      {} as SettingsSvc,
      {} as GoogleSheetSvc,
      pipeline,
    );

    await assert.rejects(
      () => svc.setOrderStage("o1", "CONFIRMED", undefined),
      BadRequestException,
    );
  });

  it("rejects RETURN_IN_PROGRESS when order has no active returns", async () => {
    const prisma = {
      order: {
        findUnique: async () => ({
          id: "o1",
          ownerId: "u1",
          contactId: "c1",
          contact: { externalCode: "CODE-1C" },
          orderStage: "RECEIVED",
          status: "RECEIVED",
          paymentType: "POSTPAYMENT",
          paidAmount: 0,
          totalAmount: 100,
          debtAmount: 100,
          paymentDueDate: null,
        }),
      },
      orderReturn: {
        count: async () => 0,
      },
    } as unknown as PrismaSvc;
    const warehouses = {} as WarehousesSvc;
    const settings = {} as SettingsSvc;
    const googleSheet = {} as GoogleSheetSvc;
    const pipeline = {
      getEffectiveTransitionGraph: async () => ({
        NEW: [],
        CONFIRMED: [],
        AWAITING_PAYMENT: [],
        AWAITING_STOCK: [],
        READY_TO_SHIP: [],
        SHIPPED: [],
        AWAITING_RECEIPT: [],
        RECEIVED: ["RETURN_IN_PROGRESS"],
        COMPLETED: ["RETURN_IN_PROGRESS"],
        CANCELED: [],
        REFUSED: [],
        RETURN_IN_PROGRESS: [],
        FULLY_RETURNED: [],
      }),
    } as unknown as PipelineSvc;
    const svc = new OrdersService(prisma, warehouses, settings, googleSheet, pipeline);

    await assert.rejects(
      () => svc.setOrderStage("o1", "RETURN_IN_PROGRESS", undefined),
      BadRequestException,
    );
  });

  it("rejects COMPLETED when payment is not closed", async () => {
    const prisma = {
      order: {
        findUnique: async () => ({
          id: "o1",
          ownerId: "u1",
          contactId: "c1",
          contact: { externalCode: "CODE-1C" },
          orderStage: "RECEIVED",
          status: "RECEIVED",
          paymentType: "DEFERRED",
          paidAmount: 200,
          totalAmount: 1000,
          debtAmount: 800,
          returnAdjustmentAmount: 0,
          subtotalAmount: 1000,
          paymentDueDate: null,
        }),
      },
      orderReturn: { count: async () => 0 },
    } as unknown as PrismaSvc;
    const svc = new OrdersService(
      prisma,
      {} as WarehousesSvc,
      {} as SettingsSvc,
      {} as GoogleSheetSvc,
      {
        getEffectiveTransitionGraph: async () => ({
          NEW: [],
          CONFIRMED: [],
          AWAITING_PAYMENT: [],
          AWAITING_STOCK: [],
          READY_TO_SHIP: [],
          SHIPPED: [],
          AWAITING_RECEIPT: [],
          RECEIVED: ["COMPLETED"],
          COMPLETED: [],
          CANCELED: [],
          REFUSED: [],
          RETURN_IN_PROGRESS: [],
          FULLY_RETURNED: [],
        }),
      } as unknown as PipelineSvc,
    );

    await assert.rejects(
      () => svc.setOrderStage("o1", "COMPLETED", undefined),
      BadRequestException,
    );
  });

  it("recalculates finance when order is canceled", async () => {
    let recalcCalled = false;
    const prisma = {
      order: {
        findUnique: async () => ({
          id: "o1",
          ownerId: "u1",
          contactId: "c1",
          contact: { externalCode: "CODE-1C", ownerId: "u1" },
          orderStage: "READY_TO_SHIP",
          status: "READY_TO_SHIP",
          paymentType: "POSTPAYMENT",
          paidAmount: 0,
          totalAmount: 100,
          subtotalAmount: 100,
          debtAmount: 100,
          returnAdjustmentAmount: 0,
          fxWriteOffAmount: 0,
          paymentDueDate: null,
          financialStatus: "AWAITING_PAYMENT",
          deliveryMethod: "NP_WAREHOUSE",
          deliveryData: null,
          ttns: [],
          shipments: [],
        }),
        update: async () => ({
          id: "o1",
          orderNumber: "ORD-1",
          orderStage: "CANCELED",
        }),
      },
      orderStatusHistory: { create: async () => ({}) },
      materialReservation: { updateMany: async () => ({ count: 0 }) },
      $transaction: async <T>(cb: (tx: unknown) => Promise<T>) => cb(prisma as unknown),
    } as unknown as PrismaSvc;
    const integrations = {
      recalcOrderFinance: async (orderId: string) => {
        recalcCalled = true;
        assert.equal(orderId, "o1");
      },
    };
    const pipeline = {
      getEffectiveTransitionGraph: async () => ({
        NEW: [],
        CONFIRMED: [],
        AWAITING_PAYMENT: [],
        AWAITING_STOCK: [],
        READY_TO_SHIP: ["CANCELED"],
        SHIPPED: [],
        AWAITING_RECEIPT: [],
        RECEIVED: [],
        COMPLETED: [],
        CANCELED: [],
        REFUSED: [],
        RETURN_IN_PROGRESS: [],
        FULLY_RETURNED: [],
      }),
    } as unknown as PipelineSvc;
    const svc = new OrdersService(
      prisma,
      {} as WarehousesSvc,
      {} as SettingsSvc,
      integrations as never,
      pipeline,
      {} as never,
      { notifyStageChanged: async () => undefined } as never,
      {
        applyReservationPolicy: async () => undefined,
        syncActiveReservationsForOrder: async () => undefined,
      } as never,
    );

    await svc.setOrderStage("o1", "CANCELED", undefined, "test cancel");
    assert.equal(recalcCalled, true);
  });
});
