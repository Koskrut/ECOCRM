import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OrdersService } from "../orders.service";

type PrismaSvc = import("../../prisma/prisma.service").PrismaService;
type WarehousesSvc = import("../../warehouses/warehouses.service").WarehousesService;
type SettingsSvc = import("../../settings/settings.service").SettingsService;
type IntegrationsSvc = import("../../integration-ports/integration-ports.service").IntegrationPortsService;
type PipelineSvc = import("../pipeline/orders-pipeline-config.service").OrdersPipelineConfigService;

describe("OrdersService.addManualLine", () => {
  it("creates a non-product line and recalculates the order total", async () => {
    const items: Array<{ lineTotal: number }> = [];
    let createdItem: Record<string, unknown> | null = null;
    let updateData: Record<string, unknown> | null = null;

    const prisma = {
      order: {
        findUnique: async (args: { include?: unknown }) => {
          if (args.include) {
            return {
              id: "order-1",
              items,
              discountAmount: 0,
              paidAmount: 0,
              returnAdjustmentAmount: 0,
              fxWriteOffAmount: 0,
              paymentType: null,
              paymentDueDate: null,
              orderStage: "NEW",
            };
          }
          return { id: "order-1", ownerId: "user-1" };
        },
        update: async (args: { data: Record<string, unknown> }) => {
          updateData = args.data;
          return { id: "order-1", items, ...args.data };
        },
      },
      orderItem: {
        create: async (args: { data: Record<string, unknown> }) => {
          createdItem = args.data;
          items.push(args.data as { lineTotal: number });
          return args.data;
        },
      },
    } as unknown as PrismaSvc;

    const svc = new OrdersService(
      prisma,
      {} as WarehousesSvc,
      {} as SettingsSvc,
      {} as IntegrationsSvc,
      {} as PipelineSvc,
      {} as never,
      {} as never,
      {
        applyReservationPolicy: async () => undefined,
        syncActiveReservationsForOrder: async () => undefined,
      } as never,
    );

    await svc.addManualLine("order-1", { name: "Послуга з ліда", qty: 1, price: 1500 });

    assert.ok(createdItem);
    assert.strictEqual(createdItem!.productId, null);
    assert.strictEqual(createdItem!.productNameSnapshot, "Послуга з ліда");
    assert.strictEqual(createdItem!.lineTotal, 1500);
    assert.ok(updateData);
    assert.strictEqual(updateData!.subtotalAmount, 1500);
    assert.strictEqual(updateData!.totalAmount, 1500);
  });
});
