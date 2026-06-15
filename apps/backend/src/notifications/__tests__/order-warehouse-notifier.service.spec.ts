import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UserRole } from "@prisma/client";
import { OrderWarehouseNotifierService } from "../order-warehouse-notifier.service";
import type { AuthUser } from "../../auth/auth.types";

type PrismaSvc = import("../../prisma/prisma.service").PrismaService;
type NotificationsSvc = import("../notifications.service").NotificationsService;

const warehouseActor: AuthUser = {
  id: "wh1",
  email: "wh@test",
  role: UserRole.WAREHOUSE,
  fullName: "Warehouse User",
};

describe("OrderWarehouseNotifierService", () => {
  it("does not notify when actor is not warehouse", async () => {
    let notified = false;
    const notifications = {
      createDebouncedQtyChange: async () => {
        notified = true;
        return null;
      },
    } as unknown as NotificationsSvc;

    const prisma = {
      order: { findUnique: async () => ({ id: "o1", orderNumber: "1", ownerId: "m1", currency: "UAH" }) },
      orderItem: { findFirst: async () => ({ productNameSnapshot: "X", product: null }) },
      activity: { create: async () => ({ id: "a1" }) },
      user: { findUnique: async () => ({ fullName: "Manager" }) },
    } as unknown as PrismaSvc;

    const svc = new OrderWarehouseNotifierService(prisma, notifications);
    await svc.notifyQtyChanged({
      orderId: "o1",
      itemId: "i1",
      prevQty: 2,
      nextQty: 1,
      prevTotalAmount: 100,
      nextTotalAmount: 50,
      actor: { ...warehouseActor, role: UserRole.MANAGER },
    });
    assert.equal(notified, false);
  });

  it("skips when qty unchanged", async () => {
    let activityCreated = false;
    const notifications = {
      createDebouncedQtyChange: async () => null,
    } as unknown as NotificationsSvc;

    const prisma = {
      activity: {
        create: async () => {
          activityCreated = true;
          return { id: "a1" };
        },
      },
    } as unknown as PrismaSvc;

    const svc = new OrderWarehouseNotifierService(prisma, notifications);
    await svc.notifyQtyChanged({
      orderId: "o1",
      itemId: "i1",
      prevQty: 3,
      nextQty: 3,
      prevTotalAmount: 100,
      nextTotalAmount: 100,
      actor: warehouseActor,
    });
    assert.equal(activityCreated, false);
  });
});
