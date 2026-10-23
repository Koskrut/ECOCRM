import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OrderSaleAssignedNotifierService } from "../order-sale-assigned-notifier.service";
import type { NotificationsService } from "../notifications.service";
import type { PrismaService } from "../../prisma/prisma.service";

describe("OrderSaleAssignedNotifierService", () => {
  it("notifies new owner with client, city and delivery", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const notifications = {
      notifyWithTeamCopy: async (params: Record<string, unknown>) => {
        calls.push(params);
        return { id: "n1" };
      },
    } as unknown as NotificationsService;

    const prisma = {
      systemSetting: {
        findUnique: async () => null,
      },
      order: {
        findUnique: async () => ({
          id: "o1",
          orderNumber: "1234",
          ownerId: "katya",
          deliveryMethod: "PICKUP",
          client: { firstName: "Іван", lastName: "Іванов", city: "Київ" },
          contact: null,
        }),
      },
      user: {
        findUnique: async () => ({ fullName: "Олена" }),
      },
    } as unknown as PrismaService;

    const svc = new OrderSaleAssignedNotifierService(prisma, notifications);
    await svc.notifyIfNeeded({
      orderId: "o1",
      newOwnerId: "katya",
      actorId: "operator1",
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.userId, "katya");
    assert.equal(calls[0]?.type, "CLIENT_ORDER_ACCEPTED");
    assert.equal(calls[0]?.entityType, "ORDER");
    assert.equal(calls[0]?.entityId, "o1");
    assert.match(String(calls[0]?.title), /№1234/);
    assert.match(String(calls[0]?.body), /Іванов Іван/);
    assert.match(String(calls[0]?.body), /Київ/);
    assert.match(String(calls[0]?.body), /Самовивіз/);
    assert.match(String(calls[0]?.body), /Олена/);
  });

  it("skips when actor assigns themselves", async () => {
    let called = false;
    const notifications = {
      notifyWithTeamCopy: async () => {
        called = true;
        return null;
      },
    } as unknown as NotificationsService;
    const prisma = {
      systemSetting: { findUnique: async () => null },
    } as unknown as PrismaService;

    const svc = new OrderSaleAssignedNotifierService(prisma, notifications);
    await svc.notifyIfNeeded({
      orderId: "o1",
      newOwnerId: "me",
      actorId: "me",
    });
    assert.equal(called, false);
  });

  it("skips when org rule is disabled", async () => {
    let called = false;
    const notifications = {
      notifyWithTeamCopy: async () => {
        called = true;
        return null;
      },
    } as unknown as NotificationsService;
    const prisma = {
      systemSetting: {
        findUnique: async () => ({
          value: { saleAssigned: { enabled: false, deliveryMethods: "ALL" } },
        }),
      },
      order: {
        findUnique: async () => ({
          id: "o1",
          orderNumber: "1",
          ownerId: "katya",
          deliveryMethod: "PICKUP",
          client: null,
          contact: null,
        }),
      },
    } as unknown as PrismaService;

    const svc = new OrderSaleAssignedNotifierService(prisma, notifications);
    await svc.notifyIfNeeded({
      orderId: "o1",
      newOwnerId: "katya",
      actorId: "op",
    });
    assert.equal(called, false);
  });

  it("skips Nova Poshta when filter is PICKUP only", async () => {
    let called = false;
    const notifications = {
      notifyWithTeamCopy: async () => {
        called = true;
        return null;
      },
    } as unknown as NotificationsService;
    const prisma = {
      systemSetting: {
        findUnique: async () => ({
          value: { saleAssigned: { enabled: true, deliveryMethods: "PICKUP" } },
        }),
      },
      order: {
        findUnique: async () => ({
          id: "o1",
          orderNumber: "1",
          ownerId: "katya",
          deliveryMethod: "NOVA_POSHTA",
          client: null,
          contact: null,
        }),
      },
    } as unknown as PrismaService;

    const svc = new OrderSaleAssignedNotifierService(prisma, notifications);
    await svc.notifyIfNeeded({
      orderId: "o1",
      newOwnerId: "katya",
      actorId: "op",
    });
    assert.equal(called, false);
  });
});
