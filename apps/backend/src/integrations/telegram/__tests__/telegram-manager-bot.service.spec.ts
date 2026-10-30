import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UserRole } from "@prisma/client";
import { TelegramManagerBotService } from "../telegram-manager-bot.service";
import type { ParsedInbound } from "../telegram.types";

type AnyRec = Record<string, unknown>;

function parsed(overrides: Partial<ParsedInbound> = {}): ParsedInbound {
  return {
    chatId: "mgr-chat",
    chatType: "private",
    userId: "tg-mgr-1",
    username: null,
    firstName: "Mgr",
    lastName: null,
    phone: null,
    messageId: 1,
    date: new Date(),
    text: "mgr:claim:conv-1",
    mediaType: null,
    fileId: null,
    isCallback: true,
    isEdit: false,
    callbackQueryId: "cb1",
    ...overrides,
  };
}

function makeSessions(initial: { state?: string; payload?: AnyRec } = {}) {
  const sessions = {
    state: initial.state ?? "idle",
    payload: { ...(initial.payload ?? {}) } as AnyRec,
    get: async () => ({ state: sessions.state, payload: sessions.payload }),
    set: async (_id: string, state: string, payload: AnyRec = {}) => {
      sessions.state = state;
      sessions.payload = payload;
    },
    resetIdle: async () => {
      sessions.state = "idle";
      sessions.payload = {};
    },
  };
  return sessions;
}

const staffUser = {
  id: "user-1",
  role: UserRole.MANAGER,
  fullName: "Оля",
  email: "o@ex.com",
};

describe("TelegramManagerBotService", () => {
  it("claims a conversation for the linked manager", async () => {
    const sent: string[] = [];
    const assignCalls: AnyRec[] = [];
    const svc = new TelegramManagerBotService(
      { user: { findFirst: async () => staffUser } } as never,
      { getStoreConfig: async () => ({}) } as never,
      makeSessions() as never,
      {
        assign: async (conversationId: string, userId: string, actor: AnyRec) => {
          assignCalls.push({ conversationId, userId, actorId: actor.id });
          return {};
        },
      } as never,
      { muteConversation: () => undefined, isMuted: () => false } as never,
      {} as never,
      {
        answerCallbackQuery: async () => undefined,
        sendMessageToChat: async (_chat: string, text: string) => {
          sent.push(text);
          return { messageId: 1 };
        },
      } as never,
    );

    const handled = await svc.handleCallback(parsed());
    assert.equal(handled, true);
    assert.equal(assignCalls[0]?.userId, "user-1");
    assert.ok(sent.some((t) => /закріплено/i.test(t)));
  });

  it("starts client search on /client", async () => {
    const sent: string[] = [];
    const sessions = makeSessions();
    const svc = new TelegramManagerBotService(
      { user: { findFirst: async () => staffUser } } as never,
      { getStoreConfig: async () => ({}) } as never,
      sessions as never,
      { assign: async () => ({}) } as never,
      { muteConversation: () => undefined } as never,
      {} as never,
      {
        sendMessageToChat: async (_chat: string, text: string) => {
          sent.push(text);
          return { messageId: 1 };
        },
      } as never,
    );

    const handled = await svc.tryHandleStaffText(
      parsed({ text: "/client", isCallback: false, callbackQueryId: null }),
    );
    assert.equal(handled, true);
    assert.equal(sessions.state, "mgr_search");
    assert.ok(sent.some((t) => /телефон або прізвище/i.test(t)));
  });

  it("lists contacts after search query", async () => {
    const sent: Array<{ text: string; options?: AnyRec }> = [];
    const sessions = makeSessions({ state: "mgr_search" });
    const svc = new TelegramManagerBotService(
      {
        user: { findFirst: async () => staffUser },
        contact: {
          findMany: async () => [
            {
              id: "c1",
              firstName: "Іван",
              lastName: "Петренко",
              phone: "+380501112233",
              documentDisplayName: null,
              telegramAccounts: [{ telegramChatId: "client-chat" }],
            },
          ],
        },
      } as never,
      { getStoreConfig: async () => ({}) } as never,
      sessions as never,
      { assign: async () => ({}) } as never,
      { muteConversation: () => undefined } as never,
      {} as never,
      {
        sendMessageToChat: async (_chat: string, text: string, options?: AnyRec) => {
          sent.push({ text, options });
          return { messageId: 1 };
        },
      } as never,
    );

    const handled = await svc.tryHandleStaffText(
      parsed({ text: "Петренко", isCallback: false, callbackQueryId: null }),
    );
    assert.equal(handled, true);
    assert.equal(sessions.payload.mgrContactHits?.[0]?.id, "c1");
    const buttons = (sent.find((s) => s.options?.inlineKeyboard)?.options
      ?.inlineKeyboard as Array<Array<AnyRec>>)!.flat();
    assert.equal(buttons[0]?.callback_data, "mgr:c:0");
  });

  it("shows orders then destination menu including client send", async () => {
    const sent: Array<{ text: string; options?: AnyRec }> = [];
    const sessions = makeSessions({
      payload: {
        mgrContactHits: [{ id: "c1", label: "Петренко", hasTelegram: true }],
      },
    });
    const svc = new TelegramManagerBotService(
      {
        user: { findFirst: async () => staffUser },
        telegramAccount: {
          findFirst: async () => ({ telegramChatId: "client-chat" }),
        },
        conversation: { findFirst: async () => null },
        order: {
          findMany: async () => [
            {
              id: "o1",
              orderNumber: "121",
              totalAmount: 1500,
              currency: "UAH",
              createdAt: new Date(),
            },
          ],
        },
      } as never,
      { getStoreConfig: async () => ({}) } as never,
      sessions as never,
      { assign: async () => ({}) } as never,
      { muteConversation: () => undefined } as never,
      {} as never,
      {
        answerCallbackQuery: async () => undefined,
        sendMessageToChat: async (_chat: string, text: string, options?: AnyRec) => {
          sent.push({ text, options });
          return { messageId: 1 };
        },
      } as never,
    );

    await svc.handleCallback(parsed({ text: "mgr:c:0" }));
    assert.equal(sessions.payload.mgrOrderHits?.[0]?.id, "o1");
    assert.equal(sessions.payload.mgrClientChatId, "client-chat");

    await svc.handleCallback(parsed({ text: "mgr:o:0", callbackQueryId: "cb-o" }));
    assert.equal(sessions.payload.mgrOrderId, "o1");
    const menu = sent.find((s) => /куди надіслати/i.test(s.text));
    const flat = (menu?.options?.inlineKeyboard as Array<Array<AnyRec>>)?.flat() ?? [];
    assert.ok(flat.some((b) => b.callback_data === "mgr:invme"));
    assert.ok(flat.some((b) => b.callback_data === "mgr:invcl"));
  });

  it("sends PDF to client chat on mgr:invcl", async () => {
    const sent: string[] = [];
    const calls: Array<{ orderId: string; kind: string; dest: string; clientChatId?: string | null }> = [];
    const sessions = makeSessions({
      payload: { mgrOrderId: "o1", mgrClientChatId: "client-chat" },
    });
    const svc = new TelegramManagerBotService(
      { user: { findFirst: async () => staffUser } } as never,
      { getStoreConfig: async () => ({}) } as never,
      sessions as never,
      { assign: async () => ({}) } as never,
      { muteConversation: () => undefined } as never,
      {
        sendDocument: async (
          orderId: string,
          kind: string,
          dest: string,
          _actor: unknown,
          overrides?: { clientChatId?: string | null },
        ) => {
          calls.push({ orderId, kind, dest, clientChatId: overrides?.clientChatId });
          return { ok: true, dest, kind };
        },
      } as never,
      {
        answerCallbackQuery: async () => undefined,
        sendMessageToChat: async (_chat: string, text: string) => {
          sent.push(text);
          return { messageId: 1 };
        },
      } as never,
    );

    await svc.handleCallback(parsed({ text: "mgr:invcl", callbackQueryId: "cb" }));
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.orderId, "o1");
    assert.equal(calls[0]?.kind, "invoice");
    assert.equal(calls[0]?.dest, "client");
    assert.equal(calls[0]?.clientChatId, "client-chat");
    assert.ok(sent.some((t) => /надіслано клієнту/i.test(t)));
  });

  it("sends invoice PDF to manager on mgr:inv", async () => {
    const calls: Array<{ orderId: string; kind: string; dest: string; managerChatId?: string | null }> = [];
    const sessions = makeSessions();
    const svc = new TelegramManagerBotService(
      { user: { findFirst: async () => staffUser } } as never,
      { getStoreConfig: async () => ({}) } as never,
      sessions as never,
      { assign: async () => ({}) } as never,
      { muteConversation: () => undefined } as never,
      {
        sendDocument: async (
          orderId: string,
          kind: string,
          dest: string,
          _actor: unknown,
          overrides?: { managerChatId?: string | null },
        ) => {
          calls.push({ orderId, kind, dest, managerChatId: overrides?.managerChatId });
          return { ok: true, dest, kind };
        },
      } as never,
      {
        answerCallbackQuery: async () => undefined,
        sendMessageToChat: async () => ({ messageId: 1 }),
      } as never,
    );

    await svc.handleCallback(parsed({ text: "mgr:inv:o1", callbackQueryId: "cb-inv" }));
    assert.equal(calls[0]?.orderId, "o1");
    assert.equal(calls[0]?.kind, "invoice");
    assert.equal(calls[0]?.dest, "me");
    assert.equal(calls[0]?.managerChatId, "mgr-chat");
  });
});
