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
  it("rejects RETURN_IN_PROGRESS when order has no active returns", async () => {
    const prisma = {
      order: {
        findUnique: async () => ({
          id: "o1",
          ownerId: "u1",
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
      }),
    } as unknown as PipelineSvc;
    const svc = new OrdersService(prisma, warehouses, settings, googleSheet, pipeline);

    await assert.rejects(
      () => svc.setOrderStage("o1", "RETURN_IN_PROGRESS", undefined),
      BadRequestException,
    );
  });
});
