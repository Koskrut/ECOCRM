import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NotificationsDeliveryService } from "../notifications-delivery.service";

describe("NotificationsDeliveryService mobile opt-out", () => {
  it("does not push when preference mobile is false even for default-mobile types", async () => {
    let sent = false;
    const prisma = {
      userNotificationPreference: {
        findUnique: async () => ({
          userId: "u1",
          type: "FIELD_GPS_STALE",
          inApp: true,
          browser: false,
          telegram: false,
          mobile: false,
        }),
      },
      userPushDevice: {
        findMany: async () => {
          sent = true;
          return [{ token: "ExponentPushToken[x]" }];
        },
      },
      user: { findUnique: async () => null },
    };
    const expoPush = { send: async () => [] };
    const telegram = { sendMessageToChat: async () => undefined };
    const svc = new NotificationsDeliveryService(
      prisma as never,
      expoPush as never,
      telegram as never,
    );

    await svc.afterCreate({
      id: "n1",
      userId: "u1",
      type: "FIELD_GPS_STALE",
      title: "GPS",
      body: null,
      entityType: "FIELD_SHIFT",
      entityId: "s1",
      meta: null,
      readAt: null,
      createdAt: new Date(),
    } as never);

    assert.equal(sent, false);
  });

  it("pushes default-mobile types when no preference row exists", async () => {
    let sent = false;
    const prisma = {
      userNotificationPreference: {
        findUnique: async () => null,
      },
      userPushDevice: {
        findMany: async () => {
          sent = true;
          return [{ token: "ExponentPushToken[x]" }];
        },
        deleteMany: async () => ({ count: 0 }),
      },
      user: { findUnique: async () => null },
    };
    const expoPush = {
      send: async () => [{ status: "ok" }],
    };
    const telegram = { sendMessageToChat: async () => undefined };
    const svc = new NotificationsDeliveryService(
      prisma as never,
      expoPush as never,
      telegram as never,
    );

    await svc.afterCreate({
      id: "n1",
      userId: "u1",
      type: "CLIENT_ORDER_ACCEPTED",
      title: "Sale",
      body: null,
      entityType: "ORDER",
      entityId: "o1",
      meta: null,
      readAt: null,
      createdAt: new Date(),
    } as never);

    assert.equal(sent, true);
  });
});
