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
    const settings = { getStoreConfig: async () => ({}) };
    const svc = new NotificationsDeliveryService(
      prisma as never,
      expoPush as never,
      settings as never,
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
    const settings = { getStoreConfig: async () => ({}) };
    const svc = new NotificationsDeliveryService(
      prisma as never,
      expoPush as never,
      settings as never,
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

  it("sends TELEGRAM_MESSAGE alerts with manager action buttons by default", async () => {
    const telegramCalls: AnyRec[] = [];
    const prisma = {
      userNotificationPreference: { findUnique: async () => null },
      userPushDevice: { findMany: async () => [] },
      user: {
        findUnique: async () => ({ telegramChatId: "tg-mgr-1", fullName: "Mgr" }),
      },
    };
    const settings = {
      getStoreConfig: async () => ({ crmPayPageUrl: "https://crm.example.com" }),
    };
    const telegram = {
      sendMessageToChat: async (chatId: string, text: string, options?: AnyRec) => {
        telegramCalls.push({ chatId, text, options });
      },
    };
    const svc = new NotificationsDeliveryService(
      prisma as never,
      { send: async () => [] } as never,
      settings as never,
      telegram as never,
    );

    await svc.afterCreate({
      id: "n1",
      userId: "u1",
      type: "TELEGRAM_MESSAGE",
      title: "Telegram: Іван",
      body: "Привіт",
      entityType: "CONVERSATION",
      entityId: "conv-42",
      meta: null,
      readAt: null,
      createdAt: new Date(),
    } as never);

    assert.equal(telegramCalls.length, 1);
    assert.equal(telegramCalls[0]?.chatId, "tg-mgr-1");
    const keyboard = telegramCalls[0]?.options?.inlineKeyboard as Array<Array<AnyRec>>;
    const flat = keyboard.flat();
    assert.ok(flat.some((b) => b.callback_data === "mgr:claim:conv-42"));
    assert.ok(flat.some((b) => b.callback_data === "mgr:mute:conv-42"));
    assert.ok(
      flat.some(
        (b) =>
          typeof b.url === "string" &&
          b.url.includes("/inbox?") &&
          b.url.includes("conversationId=conv-42"),
      ),
    );
  });

  it("adds invoice/waybill buttons on CLIENT_ORDER_ACCEPTED alerts", async () => {
    const telegramCalls: AnyRec[] = [];
    const prisma = {
      userNotificationPreference: { findUnique: async () => null },
      userPushDevice: { findMany: async () => [] },
      user: {
        findUnique: async () => ({ telegramChatId: "tg-mgr-1", fullName: "Mgr" }),
      },
    };
    const settings = {
      getStoreConfig: async () => ({ crmPayPageUrl: "https://crm.example.com" }),
    };
    const telegram = {
      sendMessageToChat: async (chatId: string, text: string, options?: AnyRec) => {
        telegramCalls.push({ chatId, text, options });
      },
    };
    const svc = new NotificationsDeliveryService(
      prisma as never,
      { send: async () => [] } as never,
      settings as never,
      telegram as never,
    );

    await svc.afterCreate({
      id: "n2",
      userId: "u1",
      type: "CLIENT_ORDER_ACCEPTED",
      title: "Нове замовлення",
      body: "№121",
      entityType: "ORDER",
      entityId: "order-77",
      meta: null,
      readAt: null,
      createdAt: new Date(),
    } as never);

    const keyboard = telegramCalls[0]?.options?.inlineKeyboard as Array<Array<AnyRec>>;
    const flat = keyboard.flat();
    assert.ok(flat.some((b) => b.callback_data === "mgr:inv:order-77"));
    assert.ok(flat.some((b) => b.callback_data === "mgr:way:order-77"));
  });
});

type AnyRec = Record<string, unknown>;
