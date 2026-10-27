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
    isEdit: false,
    callbackQueryId: null,
    ...overrides,
  };
}

function makeBot(opts: {
  sessionState?: string;
  products?: Array<AnyRec>;
  orders?: Array<AnyRec>;
  account?: AnyRec | null;
}) {
  const sent: Array<{ text: string; inline?: boolean; keyboard?: unknown }> = [];
  const listCalls: unknown[][] = [];
  const checkoutCalls: AnyRec[] = [];
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
      sent.push({
        text,
        inline: Boolean(options?.inlineKeyboard),
        keyboard: options?.menuKeyboard,
      });
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
      findUnique: async () => opts.account ?? null,
      updateMany: async () => ({ count: 0 }),
    },
  };
  const products = {
    listActive: async (...args: unknown[]) => {
      listCalls.push(args);
      return {
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
      };
    },
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
    { checkout: async (dto: AnyRec) => {
      checkoutCalls.push(dto);
      return { orderId: "o1", orderNumber: "1", contactId: "c1" };
    } } as never,
    { createPaymentLink: async () => ({ payPath: "/pay/t" }) } as never,
    products as never,
    settings as never,
    { searchNpCities: async () => ({ items: [] }) } as never,
    { listShippingProfiles: async () => ({ items: [] }) } as never,
    telegram as never,
  );

  return { service, sent, sessions, telegram, listCalls, checkoutCalls };
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
    const menu = sent.find((s) => Array.isArray(s.keyboard) && !s.inline);
    const systems = sent.find((s) => s.inline && /Системи/.test(s.text));
    assert.ok(menu);
    assert.ok(systems);
  });

  it("opens one system and does not print a zero price", async () => {
    const { service, sent, listCalls } = makeBot({
      products: [
        {
          id: "p0",
          name: "00.105",
          sku: "00.105",
          basePrice: 0,
          stock: 2,
          primaryImageUrl: null,
        },
      ],
    });
    const result = await service.handleClientTurn({
      parsed: parsed({ text: "Викрутки SUPREX" }),
      conversationId: "conv1",
      contactId: null,
      leadId: null,
    });
    assert.equal(result.handled, true);
    assert.equal(result.notifyManager, false);
    assert.equal(listCalls[0]?.[1], "00");
    const body = sent.map((s) => s.text).join("\n");
    assert.match(body, /Викрутки SUPREX/);
    assert.match(body, /ціну уточніть/);
    assert.equal(body.includes("0 грн"), false);
  });

  it("does not open a catalog system while checkout is in progress", async () => {
    const { service, sent, sessions, listCalls } = makeBot({});
    sessions.state = "checkout_city";
    sessions.payload = { region: "Київська", deliveryMethod: "NOVA_POSHTA", deliveryType: "WAREHOUSE" };
    const result = await service.handleClientTurn({
      parsed: parsed({ text: "Викрутки SUPREX" }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
    });
    assert.equal(result.handled, true);
    assert.equal(result.notifyManager, false);
    assert.equal(listCalls.length, 0);
    assert.equal(sessions.state, "checkout_city");
    assert.ok(sent.some((s) => /не знайдено|недоступний|місто/i.test(s.text)));
  });

  it("saves a checkout comment and waits for confirmation", async () => {
    const { service, sent, sessions, checkoutCalls } = makeBot({});
    sessions.state = "checkout_comment";
    sessions.payload = {
      region: "Київська",
      deliveryMethod: "PICKUP",
      paymentType: "PREPAYMENT",
      paymentMethod: "FOP",
    };
    const result = await service.handleClientTurn({
      parsed: parsed({ text: "можна на завтра?" }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
    });
    assert.equal(result.handled, true);
    assert.equal(result.notifyManager, false);
    assert.equal(checkoutCalls.length, 0);
    assert.equal(sessions.state, "checkout_comment");
    assert.equal(sessions.payload.comment, "можна на завтра?");
    assert.ok(sent.some((s) => /Оформити/.test(s.text)));
  });

  it("stores cash on delivery without deferred credit terms", async () => {
    const { service, sessions } = makeBot({});
    sessions.payload = { region: "Київська", deliveryMethod: "PICKUP" };
    await service.handleClientTurn({
      parsed: parsed({ text: "chk:pay:cod", isCallback: true, callbackQueryId: "cb-cod" }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
      callbackQueryId: "cb-cod",
    });
    assert.equal(sessions.payload.cod, true);
    assert.equal(sessions.payload.paymentMethod, "CASH");
    assert.notEqual(sessions.payload.paymentType, "DEFERRED");
  });

  it("rejects a city button that no longer matches the latest search", async () => {
    const { service, sent, sessions } = makeBot({});
    sessions.payload = {
      deliveryType: "WAREHOUSE",
      cityHits: [{ ref: "new-ref", name: "Львів" }],
    };
    await service.handleClientTurn({
      parsed: parsed({ text: "chk:city:old-ref", isCallback: true, callbackQueryId: "cb-city" }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
      callbackQueryId: "cb-city",
    });
    assert.equal(sessions.payload.cityRef, undefined);
    assert.ok(sent.some((s) => /недійсний/.test(s.text)));
  });

  it("resumes checkout after the phone is shared", async () => {
    const { service, checkoutCalls, sessions } = makeBot({
      account: { phone: "+380501112233", firstName: "Оля", lastName: "Тест", contactId: null },
    });
    sessions.state = "checkout_phone";
    sessions.payload = {
      region: "Київська",
      deliveryMethod: "PICKUP",
      paymentType: "PREPAYMENT",
      paymentMethod: "FOP",
    };
    const result = await service.handleClientTurn({
      parsed: parsed({ phone: "+380501112233", text: null }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
    });
    assert.equal(result.handled, true);
    assert.equal(result.notifyManager, false);
    assert.equal(checkoutCalls.length, 1);
    assert.equal(sessions.state, "idle");
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
