import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OrderStage, ReservationStatus } from "@prisma/client";
import { OrderMaterialReservationService } from "../order-material-reservation.service";

describe("OrderMaterialReservationService.applyReservationPolicy", () => {
  it("consumes ACTIVE reservations for shipped/received stages", async () => {
    const updates: Array<{ status: ReservationStatus }> = [];
    const prisma = {
      materialReservation: {
        updateMany: async ({ data }: { data: { status: ReservationStatus } }) => {
          updates.push(data);
          return { count: 1 };
        },
      },
    };
    const svc = new OrderMaterialReservationService(prisma as never, {
      getRules: async () => ({ softStages: [], hardStages: [], includeOrderItemsWithoutProductIdAsSoft: true }),
    } as never);

    await svc.applyReservationPolicy("o1", OrderStage.RECEIVED);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].status, ReservationStatus.CONSUMED);
  });

  it("releases ACTIVE reservations for canceled/refused stages", async () => {
    const updates: Array<{ status: ReservationStatus }> = [];
    const prisma = {
      materialReservation: {
        updateMany: async ({ data }: { data: { status: ReservationStatus } }) => {
          updates.push(data);
          return { count: 1 };
        },
      },
    };
    const svc = new OrderMaterialReservationService(prisma as never, {
      getRules: async () => ({ softStages: [], hardStages: [], includeOrderItemsWithoutProductIdAsSoft: true }),
    } as never);

    await svc.applyReservationPolicy("o1", OrderStage.CANCELED);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].status, ReservationStatus.RELEASED);
  });

  it("resyncs ACTIVE reservations for open pipeline stages", async () => {
    let created = 0;
    const prisma = {
      order: {
        findUnique: async () => ({
          id: "o1",
          warehouseId: "w1",
          orderStage: OrderStage.READY_TO_SHIP,
          items: [{ productId: "p1", qty: 3, qtyShipped: 0 }],
        }),
      },
      materialReservation: {
        updateMany: async () => ({ count: 1 }),
        createMany: async ({ data }: { data: unknown[] }) => {
          created = data.length;
          return { count: data.length };
        },
      },
    };
    const svc = new OrderMaterialReservationService(prisma as never, {
      getRules: async () => ({
        softStages: [OrderStage.NEW, OrderStage.AWAITING_PAYMENT],
        hardStages: [OrderStage.CONFIRMED, OrderStage.READY_TO_SHIP],
        includeOrderItemsWithoutProductIdAsSoft: true,
      }),
    } as never);

    await svc.applyReservationPolicy("o1", OrderStage.READY_TO_SHIP);
    assert.equal(created, 1);
  });
});
