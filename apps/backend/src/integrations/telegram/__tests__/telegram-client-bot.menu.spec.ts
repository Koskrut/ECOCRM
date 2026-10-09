import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TelegramClientBotService } from "../telegram-client-bot.service";
import type { ParsedInbound } from "../telegram.types";
import { MENU_CATALOG, MENU_MANAGER } from "../telegram-client.constants";

type AnyRec = Record<string, unknown>;

function parsed(overrides: Partial<ParsedInbound> = {}): ParsedInbound {
  return {
    chatId: "123",
    chatType: "private",
    userId: "777",
    username: null,
    firstName: "Тест",
    lastName: null,
    phone: null,
    messageId: 1,
    date: new Date(),
    text: null,
    mediaType: null,
    fileId: null,
    isCallback: false,
    callbackQueryId: null,
    ...overrides,
  };
}

function makeBot(opts: {
  sessionState?: string;
  products?: Array<AnyRec>;
  orders?: Array<AnyRec>;
}) {
  const sent: Array<{ text: string; inline?: boolean }> = [];
  const sessions = {
    state: opts.sessionState ?? "idle",
    payload: {} as AnyRec,
    get: async () => ({ state: sessions.state, payload: sessions.payload }),
    set: async (_id: string, state: string, payload: AnyRec = {}) => {
      sessions.state = state;
      sessions.payload = payload;
    },
    patchPayload: async (_id: string, state: string, patch: AnyRec) => {
      sessions.state = state;
      sessions.payload = { ...sessions.payload, ...patch };
      return sessions.payload;
    },
    resetIdle: async () => {
      sessions.state = "idle";
      sessions.payload = {};
    },
  };
  const telegram = {
    answerCallbackQuery: async () => undefined,
    sendMessageToChat: async (_chat: string, text: string, options?: AnyRec) => {
      sent.push({ text, inline: Boolean(options?.inlineKeyboard) });
      return { messageId: sent.length };
    },
    sendPhotoToChat: async () => ({ messageId: 99 }),
  };
  const prisma = {
    message: { create: async () => ({}) },
    conversation: { update: async () => ({}), updateMany: async () => ({ count: 0 }) },
    order: {
      findMany: async () => opts.orders ?? [],
      count: async () => (opts.orders ?? []).length,
      findFirst: async () => null,
    },
    lead: { findUnique: async () => null },
    telegramAccount: {
      findUnique: async () => null,
      updateMany: async () => ({ count: 0 }),
    },
  };
  const products = {
    listActive: async () => ({
      items: opts.products ?? [
        {
          id: "p1",
          name: "Товар 1",
          sku: "SKU1",
          basePrice: 10,
          stock: 5,
          primaryImageUrl: null,
        },
      ],
      total: 1,
    }),
    findActiveById: async (id: string) =>
      id === "p1"
        ? {
            id: "p1",
            name: "Товар 1",
            sku: "SKU1",
            basePrice: 10,
            stock: 5,
            primaryImageUrl: null,
          }
        : null,
  };
  const settings = { getExchangeRates: async () => ({ UAH_TO_USD: 1 / 41 }), getStoreConfig: async () => ({}) };
  const cart = {
    getCart: async () => ({ items: [], subtotal: 0, uahPerUsd: 41 }),
    addItem: async () => ({ items: [{ id: "1" }], subtotal: 10, uahPerUsd: 41 }),
    clearCart: async () => undefined,
  };

  const service = new TelegramClientBotService(
    prisma as never,
    sessions as never,
    cart as never,
    { checkout: async () => ({ orderId: "o1", orderNumber: "1", contactId: "c1" }) } as never,
    { createPaymentLink: async () => ({ payPath: "/pay/t" }) } as never,
    products as never,
    settings as never,
    { searchNpCities: async () => ({ items: [] }) } as never,
    { listShippingProfiles: async () => ({ items: [] }) } as never,
    telegram as never,
  );

  return { service, sent, sessions, telegram };
}

describe("TelegramClientBotService menu / idle", () => {
  it("handles catalog menu without notifying manager", async () => {
    const { service, sent } = makeBot({});
    const result = await service.handleClientTurn({
      parsed: parsed({ text: MENU_CATALOG }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
    });
    assert.equal(result.handled, true);
    assert.equal(result.notifyManager, false);
    assert.ok(sent.some((s) => /Каталог/i.test(s.text)));
  });

  it("routes free text in idle to the manager", async () => {
    const { service, sent } = makeBot({});
    const result = await service.handleClientTurn({
      parsed: parsed({ text: "Мені потрібна консультація" }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
    });
    assert.equal(result.handled, false);
    assert.equal(result.notifyManager, true);
    assert.equal(sent.length, 0);
  });

  it("consumes city wizard text without notifying manager", async () => {
    const { service, sent, sessions } = makeBot({});
    sessions.state = "checkout_city";
    sessions.payload = { region: "Київська", deliveryMethod: "NOVA_POSHTA", deliveryType: "WAREHOUSE" };
    const result = await service.handleClientTurn({
      parsed: parsed({ text: "Київ" }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
    });
    assert.equal(result.handled, true);
    assert.equal(result.notifyManager, false);
    assert.ok(sent.length >= 1);
  });

  it("handles manager menu prompt without notifying", async () => {
    const { service, sent } = makeBot({});
    const result = await service.handleClientTurn({
      parsed: parsed({ text: MENU_MANAGER }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
    });
    assert.equal(result.handled, true);
    assert.equal(result.notifyManager, false);
    assert.ok(sent.some((s) => /менеджер/i.test(s.text)));
  });

  it("handles catalog callback without notifying", async () => {
    const { service, sent } = makeBot({});
    const result = await service.handleClientTurn({
      parsed: parsed({ text: "cat:p:1", isCallback: true, callbackQueryId: "cb1" }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
      callbackQueryId: "cb1",
    });
    assert.equal(result.handled, true);
    assert.equal(result.notifyManager, false);
    assert.ok(sent.some((s) => /Каталог/i.test(s.text)));
  });

  it("phone share for new lead: menu, no manager notify, mentions region at checkout", async () => {
    const { service, sent } = makeBot({});
    const result = await service.handleClientTurn({
      parsed: parsed({ phone: "+380501234567", text: null }),
      conversationId: "conv1",
      contactId: null,
      leadId: "lead-1",
    });
    assert.equal(result.handled, true);
    assert.equal(result.notifyManager, false);
    assert.ok(sent.some((s) => /Номер збережено/i.test(s.text)));
    assert.ok(sent.some((s) => /область/i.test(s.text)));
  });

  it("phone share for known contact: existing-client copy", async () => {
    const { service, sent } = makeBot({});
    const result = await service.handleClientTurn({
      parsed: parsed({ phone: "+380501234567", text: null }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
    });
    assert.equal(result.handled, true);
    assert.equal(result.notifyManager, false);
    assert.ok(sent.some((s) => /Раді бачити/i.test(s.text)));
  });
});
