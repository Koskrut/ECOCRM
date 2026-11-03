import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TelegramClientBotService } from "../telegram-client-bot.service";
import type { ParsedInbound } from "../telegram.types";
import { MENU_CATALOG, MENU_CLIENT_CANCEL, MENU_MANAGER, MENU_ORDERS, MENU_START } from "../telegram-client.constants";

type AnyRec = Record<string, unknown>;

function parsed(overrides: Partial<ParsedInbound> = {}): ParsedInbound {
  return {
    chatId: "123",
    chatType: "private",
    chatTitle: null,
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
  sessionPayload?: AnyRec;
  products?: Array<AnyRec>;
  orders?: Array<AnyRec>;
  account?: AnyRec | null;
  contact?: AnyRec | null;
  /** When set, findContactByPhone returns this id (CRM match by phone). */
  contactByPhoneId?: string | null;
  lead?: AnyRec | null;
  cartItems?: Array<AnyRec>;
  tree?: Array<AnyRec>;
  storeUrl?: string | null;
  /** Org-chart slot → regions; assignments map slot → manager user id. */
  orgChart?: {
    assignments?: Record<string, string | null>;
    regions?: Record<string, string[]>;
  };
}) {
  const sent: Array<{
    text: string;
    inline?: boolean;
    keyboard?: unknown;
    contact?: boolean;
    removeKeyboard?: boolean;
    buttons?: string[];
  }> = [];
  const listCalls: unknown[][] = [];
  const pathCalls: unknown[][] = [];
  const checkoutCalls: AnyRec[] = [];
  const contactCreates: AnyRec[] = [];
  const contactUpdates: AnyRec[] = [];
  const accountUpdates: AnyRec[] = [];
  const conversationUpdates: AnyRec[] = [];
  const sessions = {
    state: opts.sessionState ?? "idle",
    payload: { ...(opts.sessionPayload ?? {}) } as AnyRec,
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
      const inline = options?.inlineKeyboard as Array<Array<{ text?: string }>> | undefined;
      sent.push({
        text,
        inline: Boolean(options?.inlineKeyboard),
        keyboard: options?.menuKeyboard,
        contact: Boolean(options?.requestContactButton),
        removeKeyboard: Boolean(options?.removeKeyboard),
        buttons: inline?.flat().map((button) => button.text ?? "").filter(Boolean),
      });
      return { messageId: sent.length };
    },
    sendPhotoToChat: async () => ({ messageId: 99 }),
  };
  const prisma = {
    message: { create: async () => ({}) },
    conversation: {
      update: async () => ({}),
      updateMany: async (args: AnyRec) => {
        conversationUpdates.push(args);
        return { count: 1 };
      },
    },
    order: {
      findMany: async () => opts.orders ?? [],
      count: async () => (opts.orders ?? []).length,
      findFirst: async () => null,
    },
    lead: { findUnique: async () => opts.lead ?? null },
    contact: {
      findUnique: async () =>
        opts.contact === undefined
          ? {
              firstName: "Тест",
              lastName: "Клієнт",
              region: "Київська",
              clientType: "Врач",
              phone: "+380671112233",
            }
          : opts.contact,
    },
    telegramAccount: {
      findUnique: async () => opts.account ?? null,
      updateMany: async () => ({ count: 0 }),
    },
    user: {
      findFirst: async (args: AnyRec) => {
        const id = args?.where?.id as string | undefined;
        if (!id) return null;
        return { id };
      },
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
    listCatalogTree: async () => opts.tree ?? [],
    listActiveByCatalogPath: async (...args: unknown[]) => {
      pathCalls.push(args);
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
  };
  const settings = {
    getExchangeRates: async () => ({ UAH_TO_USD: 1 / 41 }),
    getStoreConfig: async () => ({
      ...(opts.storeUrl ? { publicStoreUrl: opts.storeUrl } : {}),
    }),
    getOrgChartStructure: async () => ({
      assignments: opts.orgChart?.assignments ?? { "m1-1": "mgr-kyiv" },
      extraSlots: [],
      regions: opts.orgChart?.regions ?? { "m1-1": ["Київська"] },
    }),
  };
  const cart = {
    getCart: async () => ({ items: opts.cartItems ?? [], subtotal: 0, uahPerUsd: 41 }),
    addItem: async () => ({ items: [{ id: "1" }], subtotal: 10, uahPerUsd: 41 }),
    clearCart: async () => undefined,
    updateItemQty: async () => ({
      items: opts.cartItems ?? [],
      subtotal: 0,
      uahPerUsd: 41,
    }),
    removeItem: async () => ({ items: [], subtotal: 0, uahPerUsd: 41 }),
    unifyTelegramCart: async () => ({
      items: opts.cartItems ?? [],
      subtotal: 0,
      uahPerUsd: 41,
    }),
  };
  const contacts = {
    create: async (data: AnyRec) => {
      contactCreates.push(data);
      return { id: "contact-new", ...data };
    },
    findContactByPhone: async () =>
      opts.contactByPhoneId ? { id: opts.contactByPhoneId } : null,
    update: async (id: string, data: AnyRec) => {
      contactUpdates.push({ id, ...data });
      return { id, ...data };
    },
  };
  (prisma.telegramAccount as AnyRec).updateMany = async (args: AnyRec) => {
    accountUpdates.push(args);
    return { count: 1 };
  };
  (prisma.lead as AnyRec).update = async () => ({});

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
    contacts as never,
    telegram as never,
  );

  return {
    service,
    sent,
    sessions,
    telegram,
    listCalls,
    pathCalls,
    checkoutCalls,
    contactCreates,
    contactUpdates,
    accountUpdates,
    conversationUpdates,
  };
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
    // Single outbound: catalog systems inline (reply keyboard may already be set).
    assert.equal(sent.length, 1);
    assert.ok(sent[0]?.inline && /Каталог/i.test(sent[0].text));
    assert.ok(/Оберіть систему/i.test(sent[0]!.text));
  });

  it("opens the Mini App when the public store URL is configured", async () => {
    const { service, sent } = makeBot({
      storeUrl: "https://shop.example.com",
    });
    const result = await service.handleClientTurn({
      parsed: parsed({ text: MENU_CATALOG }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
    });
    assert.equal(result.handled, true);
    const body = sent.map((s) => s.text).join("\n");
    assert.match(body, /магазині Telegram|Відкрити каталог/i);
    assert.equal(
      sent.some((s) => (s.buttons ?? []).some((label) => /Відкрити каталог/i.test(label))),
      true,
    );
    assert.equal(body.includes("Системи:"), false);
  });

  it("opens categories inside a system instead of every product", async () => {
    const { service, sent, listCalls, sessions } = makeBot({
      tree: [
        { name: "Абатменти", children: ["Тимчасові", "Постійні"] },
        { name: "Гвинти", children: [] },
      ],
    });
    const result = await service.handleClientTurn({
      parsed: parsed({ text: "Викрутки SUPREX" }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
    });
    assert.equal(result.handled, true);
    assert.equal(listCalls.length, 0);
    const body = sent.map((s) => s.text).join("\n");
    const buttons = sent.flatMap((s) => s.buttons ?? []).join("\n");
    assert.match(body, /Оберіть категорію/);
    assert.match(buttons, /Абатменти/);
    assert.match(buttons, /Гвинти/);
    assert.equal(sessions.payload.catalogGroup, "00");
  });

  it("opens subcategories before the product list", async () => {
    const { service, sent, pathCalls, sessions } = makeBot({
      tree: [{ name: "Абатменти", children: ["Тимчасові", "Постійні"] }],
    });
    sessions.payload = {
      catalogGroup: "00",
      catalogBranches: [{ name: "Абатменти", children: ["Тимчасові", "Постійні"] }],
    };
    const result = await service.handleClientTurn({
      parsed: parsed({ text: "cat:k:0", isCallback: true }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
    });
    assert.equal(result.handled, true);
    assert.equal(pathCalls.length, 0);
    const body = sent.map((s) => s.text).join("\n");
    const buttons = sent.flatMap((s) => s.buttons ?? []).join("\n");
    assert.match(body, /Оберіть підкатегорію/);
    assert.match(buttons, /Тимчасові/);
    assert.match(buttons, /Постійні/);
  });

  it("lists products only inside the chosen subcategory", async () => {
    const { service, sent, listCalls, pathCalls, sessions } = makeBot({
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
    sessions.payload = {
      catalogGroup: "01",
      catalogCategory: "Абатменти",
      catalogSubHits: ["Тимчасові", "Постійні"],
      catalogBranches: [{ name: "Абатменти", children: ["Тимчасові", "Постійні"] }],
    };
    const result = await service.handleClientTurn({
      parsed: parsed({ text: "cat:n:0", isCallback: true }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
    });
    assert.equal(result.handled, true);
    assert.equal(listCalls.length, 0);
    assert.equal(pathCalls.length, 1);
    assert.equal(pathCalls[0]?.[0], "01");
    const filter = pathCalls[0]?.[2] as AnyRec;
    assert.equal(filter.categoryName, "Абатменти");
    assert.equal(filter.subcategoryName, "Тимчасові");
    const body = sent.map((s) => s.text).join("\n");
    assert.match(body, /Абатменти/);
    assert.match(body, /Тимчасові/);
    assert.match(body, /ціну уточніть/);
    assert.equal(body.includes("0 грн"), false);
  });

  it("lists products when a system has no categories", async () => {
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
      contactId: "c1",
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
    const { service, sessions } = makeBot({
      sessionState: "checkout_flow",
      sessionPayload: { region: "Київська", deliveryMethod: "PICKUP" },
    });
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
    const { service, sent, sessions } = makeBot({
      sessionState: "checkout_city",
      sessionPayload: {
        deliveryType: "WAREHOUSE",
        cityHits: [{ ref: "new-ref", name: "Львів" }],
      },
    });
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

  it("phone share without CRM contact starts onboarding (name)", async () => {
    const { service, sent, sessions } = makeBot({});
    const result = await service.handleClientTurn({
      parsed: parsed({ phone: "+380501234567", text: null }),
      conversationId: "conv1",
      contactId: null,
      leadId: "lead-1",
    });
    assert.equal(result.handled, true);
    assert.equal(result.notifyManager, false);
    assert.equal(sessions.state, "onboarding_name");
    assert.ok(sent.some((s) => /Номер збережено/i.test(s.text)));
    assert.ok(sent.some((s) => /ім'я та прізвище/i.test(s.text)));
    assert.ok(
      sent.some((s) => JSON.stringify(s.keyboard ?? []).includes("Скасувати")),
      "onboarding shows cancel, not commerce menu",
    );
    assert.ok(
      !sent.some((s) => JSON.stringify(s.keyboard ?? []).includes("Каталог")),
      "hides commerce keyboard during onboarding",
    );
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

  it("phone share does not ask role/region when CRM contact already has them", async () => {
    const { service, sent, sessions } = makeBot({
      contactByPhoneId: "c1",
      contact: {
        firstName: "Іван",
        lastName: "Петренко",
        region: "Київська",
        clientType: "Врач",
        phone: "+380501234567",
      },
    });
    await service.handleClientTurn({
      parsed: parsed({ phone: "+380501234567", text: null }),
      conversationId: "conv1",
      contactId: null,
      leadId: "stale-lead",
    });
    assert.equal(sessions.state, "idle");
    assert.ok(sent.some((s) => /Раді бачити/i.test(s.text)));
    assert.ok(!sent.some((s) => /лікар чи технік|область/i.test(s.text)));
  });

  it("phone share asks only missing region when role already set", async () => {
    const { service, sent, sessions } = makeBot({
      contactByPhoneId: "c1",
      contact: {
        firstName: "Іван",
        lastName: "Петренко",
        region: null,
        clientType: "Врач",
        phone: "+380501234567",
      },
    });
    await service.handleClientTurn({
      parsed: parsed({ phone: "+380501234567", text: null }),
      conversationId: "conv1",
      contactId: null,
      leadId: null,
    });
    assert.equal(sessions.state, "onboarding_region");
    assert.ok(sent.some((s) => /област/i.test(s.text)));
    assert.ok(!sent.some((s) => /лікар чи технік/i.test(s.text)));
  });

  it("phone share for known contact with missing role starts gap-fill", async () => {
    const { service, sent, sessions } = makeBot({
      contact: {
        firstName: "Іван",
        lastName: "Петренко",
        region: "Київська",
        clientType: null,
        phone: "+380501234567",
      },
    });
    const result = await service.handleClientTurn({
      parsed: parsed({ phone: "+380501234567", text: null }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
    });
    assert.equal(result.handled, true);
    assert.equal(sessions.state, "onboarding_role");
    assert.ok(sent.some((s) => /лікар чи технік/i.test(s.text)));
    assert.ok(sent.some((s) => /профілі не вистачає/i.test(s.text)));
    assert.ok(!sent.some((s) => /Раді бачити/i.test(s.text)));
    assert.ok(
      sent.some((s) => JSON.stringify(s.keyboard ?? []).includes("Скасувати")),
      "gap-fill sets Cancel reply keyboard before role inline",
    );
    const roleInline = sent.find((s) => s.inline && /лікар чи технік/i.test(s.text));
    assert.ok(roleInline?.buttons?.some((b) => /Скасувати/i.test(b)));
    assert.ok(roleInline?.buttons?.some((b) => /Назад/i.test(b)));
  });

  it("phone share skips onboarding when lead already has a CRM contact", async () => {
    const { service, sent, sessions, accountUpdates } = makeBot({
      lead: { contactId: "c-from-lead", companyId: "co-1" },
    });
    const result = await service.handleClientTurn({
      parsed: parsed({ phone: "+380501234567", text: null }),
      conversationId: "conv1",
      contactId: null,
      leadId: "lead-1",
    });
    assert.equal(result.handled, true);
    assert.equal(sessions.state, "idle");
    assert.ok(sent.some((s) => /Раді бачити/i.test(s.text)));
    assert.ok(accountUpdates.some((u) => u?.data?.contactId === "c-from-lead"));
  });

  it("/menu during onboarding re-prompts and keeps collected name", async () => {
    const { service, sent, sessions } = makeBot({
      sessionState: "onboarding_role",
      sessionPayload: {
        onboardingFirstName: "Олена",
        onboardingLastName: "Коваленко",
      },
    });
    await service.handleClientTurn({
      parsed: parsed({ text: "/menu" }),
      conversationId: "conv1",
      contactId: null,
      leadId: "lead-1",
    });
    assert.equal(sessions.state, "onboarding_role");
    assert.equal(sessions.payload.onboardingFirstName, "Олена");
    assert.ok(sent.some((s) => /лікар чи технік/i.test(s.text)));
  });

  it("/start mid-onboarding resumes the current step without wiping payload", async () => {
    const { service, sent, sessions } = makeBot({
      account: { phone: "+380501112233", contactId: null, leadId: "lead-1" },
      sessionState: "onboarding_region",
      sessionPayload: {
        onboardingFirstName: "Олена",
        onboardingLastName: "Коваленко",
        onboardingClientType: "Врач",
      },
    });
    await service.handleClientTurn({
      parsed: parsed({ text: "/start" }),
      conversationId: "conv1",
      contactId: null,
      leadId: "lead-1",
    });
    assert.equal(sessions.state, "onboarding_region");
    assert.equal(sessions.payload.onboardingClientType, "Врач");
    assert.ok(sent.some((s) => /Оберіть область/i.test(s.text)));
  });

  it("🏠 Старт button resumes like /start for a known client", async () => {
    const { service, sent } = makeBot({
      account: { phone: "+380501112233", contactId: "c1", leadId: null },
    });
    await service.handleClientTurn({
      parsed: parsed({ text: MENU_START }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
    });
    assert.ok(sent.some((s) => /Раді бачити/i.test(s.text)));
    // Working menu has no permanent Старт — only commerce buttons.
    assert.ok(
      sent.some(
        (s) =>
          Array.isArray(s.keyboard) &&
          JSON.stringify(s.keyboard).includes("Каталог") &&
          !JSON.stringify(s.keyboard).includes("Старт"),
      ),
    );
  });

  it("stale onboarding callback does not wipe an active checkout session", async () => {
    const { service, sessions } = makeBot({
      sessionState: "checkout_city",
      sessionPayload: { region: "Київська", deliveryMethod: "NOVA_POSHTA" },
    });
    await service.handleClientTurn({
      parsed: parsed({ text: "onb:role:doctor", isCallback: true }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
      callbackQueryId: "stale-onb",
    });
    assert.equal(sessions.state, "checkout_city");
    assert.equal(sessions.payload.region, "Київська");
  });

  it("region callback without role keeps the name and re-asks role", async () => {
    const { service, sent, sessions } = makeBot({
      sessionState: "onboarding_role",
      sessionPayload: {
        onboardingFirstName: "Олена",
        onboardingLastName: "Коваленко",
      },
    });
    await service.handleClientTurn({
      parsed: parsed({ text: "onb:reg:9", isCallback: true }),
      conversationId: "conv1",
      contactId: null,
      leadId: "lead-1",
      callbackQueryId: "reg-early",
    });
    assert.equal(sessions.state, "onboarding_role");
    assert.equal(sessions.payload.onboardingFirstName, "Олена");
    assert.equal(sessions.payload.onboardingClientType, undefined);
    assert.ok(sent.some((s) => /лікар чи технік/i.test(s.text)));
  });

  it("catalog menu during name step does not become a fake first/last name", async () => {
    const { service, sent, sessions } = makeBot({
      sessionState: "onboarding_name",
      sessionPayload: {},
    });
    await service.handleClientTurn({
      parsed: parsed({ text: MENU_CATALOG }),
      conversationId: "conv1",
      contactId: null,
      leadId: "lead-1",
    });
    assert.equal(sessions.state, "onboarding_name");
    assert.equal(sessions.payload.onboardingFirstName, undefined);
    assert.ok(sent.some((s) => /ім'я та прізвище/i.test(s.text)));
  });

  it("blocks catalog until CRM profile exists (asks for phone)", async () => {
    const { service, sent, sessions } = makeBot({});
    await service.handleClientTurn({
      parsed: parsed({ text: MENU_CATALOG }),
      conversationId: "conv1",
      contactId: null,
      leadId: null,
    });
    assert.equal(sessions.state, "idle");
    assert.equal(sent.some((s) => s.contact), true);
    assert.ok(sent.some((s) => /поділіться номером/i.test(s.text)));
  });

  it("blocks catalog when phone exists but onboarding is incomplete", async () => {
    const { service, sent, sessions } = makeBot({
      account: { phone: "+380501112233", contactId: null, leadId: null },
    });
    await service.handleClientTurn({
      parsed: parsed({ text: MENU_CATALOG }),
      conversationId: "conv1",
      contactId: null,
      leadId: null,
    });
    assert.equal(sessions.state, "onboarding_name");
    // One onboarding prompt (intro + ask name), no separate PROFILE_REQUIRED ping.
    assert.equal(sent.length, 1);
    assert.ok(sent.some((s) => /ім'я та прізвище/i.test(s.text)));
  });

  it("/cancel during onboarding pauses with a resume hint", async () => {
    const { service, sent, sessions } = makeBot({
      sessionState: "onboarding_role",
      sessionPayload: {
        onboardingFirstName: "Олена",
        onboardingLastName: "Коваленко",
      },
    });
    await service.handleClientTurn({
      parsed: parsed({ text: "/cancel" }),
      conversationId: "conv1",
      contactId: null,
      leadId: "lead-1",
    });
    assert.equal(sessions.state, "idle");
    assert.ok(sent.some((s) => /Профіль ще не завершено/i.test(s.text)));
    assert.ok(sent.some((s) => /Старт/i.test(s.text)));
    assert.ok(
      sent.some((s) => JSON.stringify(s.keyboard ?? []).includes("Старт")),
      "pause shows Старт, not commerce menu",
    );
  });

  it("preserves checkout draft while starting onboarding after checkout phone", async () => {
    const { service, sessions } = makeBot({
      sessionState: "checkout_phone",
      sessionPayload: {
        deliveryMethod: "PICKUP",
        paymentType: "PREPAYMENT",
        cod: false,
      },
    });
    await service.handleClientTurn({
      parsed: parsed({ phone: "+380501112233", text: null }),
      conversationId: "conv1",
      contactId: null,
      leadId: null,
    });
    assert.equal(sessions.state, "onboarding_name");
    assert.equal(sessions.payload.deliveryMethod, "PICKUP");
    assert.equal(sessions.payload.paymentType, "PREPAYMENT");
  });

  it("asks missing role for an existing contact without clientType", async () => {
    const { service, sent, sessions } = makeBot({
      contact: {
        firstName: "Олена",
        lastName: "Коваленко",
        region: "Київська",
        clientType: null,
      },
    });
    await service.handleClientTurn({
      parsed: parsed({ text: "/start" }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
    });
    assert.equal(sessions.state, "onboarding_role");
    assert.equal(sessions.payload.onboardingContactId, "c1");
    assert.ok(sent.some((s) => /лікар чи технік/i.test(s.text)));
  });

  it("orders work even when contact is missing clientType (no gap-fill loop)", async () => {
    const { service, sent, sessions } = makeBot({
      contact: {
        firstName: "Олена",
        lastName: "Коваленко",
        region: "Київська",
        clientType: null,
      },
      orders: [
        {
          id: "o1",
          orderNumber: "42",
          orderStage: "NEW",
          status: "NEW",
          totalAmount: 100,
          currency: "UAH",
          createdAt: new Date(),
        },
      ],
    });
    await service.handleClientTurn({
      parsed: parsed({ text: MENU_ORDERS }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
    });
    assert.equal(sessions.state, "idle");
    assert.ok(!sent.some((s) => /лікар чи технік/i.test(s.text)));
    assert.ok(sent.some((s) => /Замовлення|№42/i.test(s.text)));
  });

  it("gap-fill role finishes immediately when contact already has region", async () => {
    const { service, sent, sessions, contactUpdates } = makeBot({
      contact: {
        firstName: "Олена",
        lastName: "Коваленко",
        region: "Київська",
        clientType: null,
      },
      sessionState: "onboarding_role",
      sessionPayload: {
        onboardingContactId: "c1",
        onboardingFirstName: "Олена",
        onboardingLastName: "Коваленко",
      },
    });
    await service.handleClientTurn({
      parsed: parsed({
        text: "onb:role:doctor",
        isCallback: true,
        callbackQueryId: "cb-role",
      }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
    });
    assert.equal(sessions.state, "idle");
    assert.ok(contactUpdates.some((u) => u.clientType === "Врач"));
    assert.ok(sent.some((s) => /Готово|профіль збережено/i.test(s.text)));
    assert.ok(!sent.some((s) => /Оберіть область/i.test(s.text)));
  });

  it("Замовлення escapes a stuck gap-fill session", async () => {
    const { service, sent, sessions } = makeBot({
      contact: {
        firstName: "Олена",
        lastName: "Коваленко",
        region: "Київська",
        clientType: null,
      },
      sessionState: "onboarding_role",
      sessionPayload: {
        onboardingContactId: "c1",
        onboardingFirstName: "Олена",
        onboardingLastName: "Коваленко",
      },
      orders: [],
    });
    await service.handleClientTurn({
      parsed: parsed({ text: MENU_ORDERS }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
    });
    assert.equal(sessions.state, "idle");
    assert.ok(!sent.some((s) => /лікар чи технік/i.test(s.text)));
  });

  it("greets a linked client without asking for a phone", async () => {
    const { service, sent } = makeBot({});
    const result = await service.handleClientTurn({
      parsed: parsed({ text: "/start" }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
    });
    assert.equal(result.handled, true);
    const body = sent.map((s) => s.text).join("\n");
    assert.match(body, /Раді бачити/);
    assert.equal(/поділіться номером/i.test(body), false);
    assert.equal(sent.some((s) => s.contact), false);
  });

  it("asks for a phone only when the chat is not a known client", async () => {
    const { service, sent } = makeBot({});
    await service.handleClientTurn({
      parsed: parsed({ text: "/start" }),
      conversationId: "conv1",
      contactId: null,
      leadId: null,
    });
    assert.equal(
      sent.some((s) => s.contact && /Вітаємо/i.test(s.text)),
      true,
    );
  });

  it("starts onboarding on /start when phone exists but CRM contact does not", async () => {
    const { service, sent, sessions } = makeBot({
      account: { phone: "+380501112233", contactId: null, leadId: null },
    });
    await service.handleClientTurn({
      parsed: parsed({ text: "/start" }),
      conversationId: "conv1",
      contactId: null,
      leadId: null,
    });
    assert.equal(sessions.state, "onboarding_name");
    const body = sent.map((s) => s.text).join("\n");
    assert.match(body, /ім'я та прізвище/i);
    assert.equal(/поділіться номером/i.test(body), false);
  });

  it("onboarding collects name → role → region and creates CRM contact", async () => {
    const { service, sent, sessions, contactCreates, accountUpdates, conversationUpdates } =
      makeBot({
      account: { phone: "+380501112233", contactId: null, leadId: "lead-1" },
      lead: { companyId: "company-1" },
      orgChart: {
        assignments: { "m1-1": "mgr-kyiv" },
        regions: { "m1-1": ["Київська"] },
      },
    });

    await service.handleClientTurn({
      parsed: parsed({ phone: "+380501112233", text: null }),
      conversationId: "conv1",
      contactId: null,
      leadId: "lead-1",
    });
    assert.equal(sessions.state, "onboarding_name");

    await service.handleClientTurn({
      parsed: parsed({ text: "Олена Коваленко" }),
      conversationId: "conv1",
      contactId: null,
      leadId: "lead-1",
    });
    assert.equal(sessions.state, "onboarding_role");
    assert.equal(sessions.payload.onboardingFirstName, "Олена");
    assert.equal(sessions.payload.onboardingLastName, "Коваленко");
    assert.ok(sent.some((s) => /лікар чи технік/i.test(s.text)));

    await service.handleClientTurn({
      parsed: parsed({ text: "onb:role:doctor", isCallback: true }),
      conversationId: "conv1",
      contactId: null,
      leadId: "lead-1",
      callbackQueryId: "cb-role",
    });
    assert.equal(sessions.state, "onboarding_region");
    assert.equal(sessions.payload.onboardingClientType, "Врач");
    assert.ok(sent.some((s) => /Оберіть область/i.test(s.text)));

    // Київська is index 9 in UKRAINE_REGIONS
    await service.handleClientTurn({
      parsed: parsed({ text: "onb:reg:9", isCallback: true }),
      conversationId: "conv1",
      contactId: null,
      leadId: "lead-1",
      callbackQueryId: "cb-reg",
    });
    assert.equal(sessions.state, "idle");
    assert.equal(contactCreates.length, 1);
    assert.equal(contactCreates[0]?.firstName, "Олена");
    assert.equal(contactCreates[0]?.lastName, "Коваленко");
    assert.equal(contactCreates[0]?.clientType, "Врач");
    assert.equal(contactCreates[0]?.region, "Київська");
    assert.equal(contactCreates[0]?.ownerId, "mgr-kyiv");
    assert.equal(contactCreates[0]?.companyId, "company-1");
    assert.ok(accountUpdates.some((u) => u?.data?.contactId === "contact-new"));
    assert.ok(
      conversationUpdates.some((u) => u?.data?.assignedToUserId === "mgr-kyiv"),
      "inbox thread auto-assigned to regional manager",
    );
    assert.ok(sent.some((s) => /Готово/i.test(s.text)));
  });

  it("uses the CRM contact phone and does not ask a linked client to share", async () => {
    const { service, sent } = makeBot({
      cartItems: [{ id: "1" }],
      account: { phone: null, contactId: "c1", leadId: null },
      contact: {
        phone: "+380671112233",
        firstName: "Оля",
        lastName: "Тест",
        region: "Київська",
        clientType: "Врач",
      },
    });
    const result = await service.handleClientTurn({
      parsed: parsed({ text: "cart:chk", isCallback: true }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
    });
    assert.equal(result.handled, true);
    const body = sent.map((s) => s.text).join("\n");
    assert.equal(/поділіться номером/i.test(body), false);
    assert.match(body, /область/);
  });

  it("Оформити resumes a saved checkout draft instead of wiping it", async () => {
    const { service, sent, sessions } = makeBot({
      cartItems: [{ id: "1" }],
      account: { phone: "+380501112233", contactId: "c1", leadId: null },
      sessionState: "idle",
      sessionPayload: {
        region: "Київська",
        deliveryMethod: "PICKUP",
      },
    });
    await service.handleClientTurn({
      parsed: parsed({ text: "cart:chk", isCallback: true }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
    });
    assert.equal(sessions.state, "checkout_flow");
    assert.equal(sessions.payload.region, "Київська");
    assert.equal(sessions.payload.deliveryMethod, "PICKUP");
    assert.ok(sent.some((s) => /Оплата/i.test(s.text)));
    assert.ok(
      sent.some((s) => JSON.stringify(s.keyboard ?? []).includes("Скасувати")),
      "checkout uses flow keyboard, not commerce menu",
    );
  });

  it("phone share during incomplete NP checkout does not call finishCheckout", async () => {
    const { service, checkoutCalls, sessions, sent } = makeBot({
      account: { phone: null, firstName: "Оля", lastName: "Тест", contactId: null },
      contactByPhoneId: "c1",
      sessionState: "checkout_phone",
      sessionPayload: {
        region: "Київська",
        deliveryMethod: "NOVA_POSHTA",
        // city / warehouse / payment still missing
      },
    });
    await service.handleClientTurn({
      parsed: parsed({ phone: "+380501112233", text: null }),
      conversationId: "conv1",
      contactId: null,
      leadId: null,
    });
    assert.equal(checkoutCalls.length, 0);
    assert.equal(sessions.payload.region, "Київська");
    assert.equal(sessions.payload.deliveryMethod, "NOVA_POSHTA");
    assert.ok(sent.some((s) => /Продовжуємо оформлення|Тип доставки|міста/i.test(s.text)));
  });

  it("/start during checkout keeps the draft and reminds the user", async () => {
    const { service, sent, sessions } = makeBot({
      sessionState: "checkout_city",
      sessionPayload: { region: "Київська", deliveryMethod: "NOVA_POSHTA" },
    });
    await service.handleClientTurn({
      parsed: parsed({ text: "/start" }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
    });
    assert.equal(sessions.state, "checkout_city");
    assert.equal(sessions.payload.region, "Київська");
    assert.ok(sent.some((s) => /оформлення|кошик|Скасувати/i.test(s.text)));
  });

  it("stale chk callback while idle is ignored", async () => {
    const { service, sessions } = makeBot({
      sessionState: "idle",
      sessionPayload: {},
    });
    await service.handleClientTurn({
      parsed: parsed({ text: "chk:reg:0", isCallback: true, callbackQueryId: "stale-chk" }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
      callbackQueryId: "stale-chk",
    });
    assert.equal(sessions.state, "idle");
    assert.equal(sessions.payload.region, undefined);
  });

  it("blocks checkout region with no manager and no STORE_OWNER_ID", async () => {
    const prev = process.env.STORE_OWNER_ID;
    delete process.env.STORE_OWNER_ID;
    try {
      const { service, sent, sessions } = makeBot({
        sessionState: "checkout_flow",
        sessionPayload: {},
        orgChart: { assignments: {}, regions: {} },
        cartItems: [{ id: "1" }],
        account: { phone: "+380501112233", contactId: "c1" },
      });
      await service.handleClientTurn({
        parsed: parsed({ text: "chk:reg:0", isCallback: true, callbackQueryId: "cb-reg" }),
        conversationId: "conv1",
        contactId: "c1",
        leadId: null,
        callbackQueryId: "cb-reg",
      });
      assert.equal(sessions.payload.region, undefined);
      assert.ok(sent.some((s) => /немає менеджера/i.test(s.text)));
    } finally {
      if (prev == null) delete process.env.STORE_OWNER_ID;
      else process.env.STORE_OWNER_ID = prev;
    }
  });

  it("stale catalog callback during checkout does not wipe the draft", async () => {
    const { service, sessions, sent } = makeBot({
      sessionState: "checkout_city",
      sessionPayload: { region: "Київська", deliveryMethod: "NOVA_POSHTA" },
    });
    await service.handleClientTurn({
      parsed: parsed({ text: "cat:home", isCallback: true, callbackQueryId: "stale-cat" }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
      callbackQueryId: "stale-cat",
    });
    assert.equal(sessions.state, "checkout_city");
    assert.equal(sessions.payload.region, "Київська");
    assert.ok(sent.some((s) => /оформлення|кошик|Скасувати/i.test(s.text)));
  });

  it("cart:clr during checkout is ignored so the cart is not emptied mid-wizard", async () => {
    const { service, sessions, sent } = makeBot({
      sessionState: "checkout_flow",
      sessionPayload: { region: "Київська", deliveryMethod: "PICKUP" },
      cartItems: [{ id: "1" }],
    });
    await service.handleClientTurn({
      parsed: parsed({ text: "cart:clr", isCallback: true, callbackQueryId: "clr" }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
      callbackQueryId: "clr",
    });
    assert.equal(sessions.state, "checkout_flow");
    assert.equal(sessions.payload.region, "Київська");
    assert.equal(sent.some((s) => /очищено/i.test(s.text)), false);
  });

  it("asks for phone during checkout with Скасувати on the keyboard", async () => {
    const { service, sent, sessions } = makeBot({
      cartItems: [{ id: "1" }],
      account: { phone: null, contactId: "c1", leadId: null },
      contact: {
        phone: null,
        firstName: "Оля",
        lastName: "Тест",
        region: "Київська",
        clientType: "Врач",
      },
    });
    await service.handleClientTurn({
      parsed: parsed({ text: "cart:chk", isCallback: true }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
    });
    assert.equal(sessions.state, "checkout_phone");
    assert.ok(sent.some((s) => s.contact === true));
    assert.ok(
      sent.some((s) => JSON.stringify(s.keyboard ?? []).includes("Скасувати")),
      "phone request keeps checkout cancel keyboard",
    );
  });

  it("staff shop idle text is not forwarded to the manager inbox", async () => {
    const { service } = makeBot({
      sessionState: "idle",
      sessionPayload: { staffShopMode: true },
      account: { phone: "+380501112233", contactId: "c1" },
    });
    const result = await service.handleClientTurn({
      parsed: parsed({ text: "просто дивлюсь каталог" }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
    });
    assert.equal(result.handled, true);
    assert.equal(result.notifyManager, false);
  });

  it("checkout region and payment inline include Скасувати; payment also has Назад", async () => {
    const { service, sent, sessions } = makeBot({
      cartItems: [{ id: "1" }],
      account: { phone: "+380501112233", contactId: "c1", leadId: null },
      sessionState: "idle",
      sessionPayload: {},
    });
    await service.handleClientTurn({
      parsed: parsed({ text: "cart:chk", isCallback: true, callbackQueryId: "chk0" }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
      callbackQueryId: "chk0",
    });
    assert.equal(sessions.state, "checkout_flow");
    const regionMsg = sent.find((s) => /Оберіть область/i.test(s.text));
    assert.ok(regionMsg?.buttons?.some((b) => /Скасувати/i.test(b)));
    assert.equal(
      regionMsg?.buttons?.some((b) => /Назад/i.test(b)),
      false,
      "first checkout step has Cancel only",
    );

    sessions.state = "checkout_flow";
    sessions.payload = { region: "Київська" };
    await service.handleClientTurn({
      parsed: parsed({ text: "chk:del:pickup", isCallback: true, callbackQueryId: "del2" }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
      callbackQueryId: "del2",
    });
    const payMsg = [...sent].reverse().find((s) => /Оплата/i.test(s.text));
    assert.ok(payMsg?.buttons?.some((b) => /Скасувати/i.test(b)), "payment has Cancel");
    assert.ok(payMsg?.buttons?.some((b) => /Назад/i.test(b)), "payment has Back");
  });

  it("chk:abort resets checkout to idle with cancelled message", async () => {
    const { service, sent, sessions } = makeBot({
      sessionState: "checkout_flow",
      sessionPayload: { region: "Київська", deliveryMethod: "PICKUP" },
      cartItems: [{ id: "1" }],
      account: { phone: "+380501112233", contactId: "c1" },
    });
    await service.handleClientTurn({
      parsed: parsed({ text: "chk:abort", isCallback: true, callbackQueryId: "abort1" }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
      callbackQueryId: "abort1",
    });
    assert.equal(sessions.state, "idle");
    assert.equal(sessions.payload.region, undefined);
    assert.ok(sent.some((s) => /Скасовано/i.test(s.text)));
  });

  it("chk:back from payment returns to delivery and keeps region", async () => {
    const { service, sent, sessions } = makeBot({
      sessionState: "checkout_flow",
      sessionPayload: { region: "Київська", deliveryMethod: "PICKUP" },
      cartItems: [{ id: "1" }],
      account: { phone: "+380501112233", contactId: "c1" },
    });
    await service.handleClientTurn({
      parsed: parsed({ text: "chk:back", isCallback: true, callbackQueryId: "back1" }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
      callbackQueryId: "back1",
    });
    assert.equal(sessions.state, "checkout_flow");
    assert.equal(sessions.payload.region, "Київська");
    assert.equal(sessions.payload.deliveryMethod, undefined);
    assert.ok(sent.some((s) => /Спосіб доставки/i.test(s.text)));
    const deliveryMsg = [...sent].reverse().find((s) => /Спосіб доставки/i.test(s.text));
    assert.ok(deliveryMsg?.buttons?.some((b) => /Скасувати/i.test(b)));
    assert.ok(deliveryMsg?.buttons?.some((b) => /Назад/i.test(b)));
  });

  it("subcategory list includes Кошик footer", async () => {
    const { service, sent, sessions } = makeBot({
      tree: [{ name: "Абатменти", children: ["Тимчасові", "Постійні"] }],
    });
    sessions.payload = {
      catalogGroup: "00",
      catalogBranches: [{ name: "Абатменти", children: ["Тимчасові", "Постійні"] }],
    };
    await service.handleClientTurn({
      parsed: parsed({ text: "cat:k:0", isCallback: true, callbackQueryId: "sub1" }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
      callbackQueryId: "sub1",
    });
    const buttons = sent.flatMap((s) => s.buttons ?? []).join("\n");
    assert.match(buttons, /Кошик/);
    assert.match(buttons, /Категорії|Пошук/);
  });

  it("category list includes Кошик footer", async () => {
    const { service, sent } = makeBot({
      tree: [
        { name: "Абатменти", children: ["Тимчасові"] },
        { name: "Гвинти", children: [] },
      ],
    });
    await service.handleClientTurn({
      parsed: parsed({ text: "Викрутки SUPREX" }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
    });
    const buttons = sent.flatMap((s) => s.buttons ?? []).join("\n");
    assert.match(buttons, /Кошик/);
    assert.match(buttons, /Системи/);
  });

  it("chk:back after Nova Poshta warehouse keeps the city and drops only the branch", async () => {
    const { service, sent, sessions } = makeBot({
      sessionState: "checkout_flow",
      sessionPayload: {
        region: "Київська",
        deliveryMethod: "NOVA_POSHTA",
        deliveryType: "WAREHOUSE",
        cityRef: "city-1",
        cityName: "Київ",
        warehouseRef: "wh-1",
        warehouseName: "Відділення 1",
      },
      account: { phone: "+380501112233", contactId: "c1" },
    });
    await service.handleClientTurn({
      parsed: parsed({ text: "chk:back", isCallback: true, callbackQueryId: "back-np" }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
      callbackQueryId: "back-np",
    });
    assert.equal(sessions.state, "checkout_warehouse_q");
    assert.equal(sessions.payload.cityRef, "city-1");
    assert.equal(sessions.payload.warehouseRef, undefined);
    assert.equal(sessions.payload.deliveryMethod, "NOVA_POSHTA");
    assert.equal(sessions.payload.deliveryType, "WAREHOUSE");
    const prompt = [...sent].reverse().find((s) => /відділення/i.test(s.text));
    assert.ok(prompt?.buttons?.some((b) => /Назад/i.test(b)));
    assert.ok(prompt?.buttons?.some((b) => /Скасувати/i.test(b)));
  });

  it("Cancel before a profile returns to Старт instead of the commerce menu", async () => {
    const { service, sent, sessions } = makeBot({ account: null });
    await service.handleClientTurn({
      parsed: parsed({ text: MENU_CLIENT_CANCEL }),
      conversationId: "conv1",
      contactId: null,
      leadId: null,
    });
    assert.equal(sessions.state, "idle");
    assert.ok(sent.some((s) => /Старт/i.test(s.text)));
    assert.equal(
      sent.some((s) => JSON.stringify(s.keyboard ?? []).includes("Каталог")),
      false,
    );
  });

  it("/help during checkout keeps the wizard and the Cancel keyboard", async () => {
    const { service, sent, sessions } = makeBot({
      sessionState: "checkout_city",
      sessionPayload: { region: "Київська", deliveryMethod: "NOVA_POSHTA", deliveryType: "WAREHOUSE" },
    });
    await service.handleClientTurn({
      parsed: parsed({ text: "/help" }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
    });
    assert.equal(sessions.state, "checkout_city");
    assert.equal(sessions.payload.region, "Київська");
    assert.ok(sent.some((s) => JSON.stringify(s.keyboard ?? []).includes("Скасувати")));
    assert.equal(sent.some((s) => /Каталог — товари/i.test(s.text)), false);
  });

  it("catalog search cancel returns to the open system, not the root", async () => {
    const { service, sent } = makeBot({
      sessionState: "catalog_search",
      sessionPayload: {
        catalogGroup: "00",
        catalogBranches: [{ name: "Абатменти", children: ["Тимчасові"] }],
      },
      tree: [{ name: "Абатменти", children: ["Тимчасові"] }],
    });
    await service.handleClientTurn({
      parsed: parsed({ text: MENU_CLIENT_CANCEL }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
    });
    const body = sent.map((s) => s.text).join("\n");
    const buttons = sent.flatMap((s) => s.buttons ?? []).join("\n");
    assert.match(body, /Оберіть категорію/);
    assert.match(buttons, /Абатменти/);
    assert.equal(/Оберіть систему/i.test(body), false);
  });

  it("cart lines expose plus, minus and remove", async () => {
    const { service, sent } = makeBot({
      cartItems: [{ id: "line1", name: "Абатмент", qty: 2, lineTotal: 10, price: 5 }],
    });
    await service.handleClientTurn({
      parsed: parsed({ text: "cart:show", isCallback: true, callbackQueryId: "cart1" }),
      conversationId: "conv1",
      contactId: "c1",
      leadId: null,
      callbackQueryId: "cart1",
    });
    const buttons = sent.flatMap((s) => s.buttons ?? []);
    assert.ok(buttons.some((b) => b === "−"));
    assert.ok(buttons.some((b) => b === "+"));
    assert.ok(buttons.some((b) => b === "✕"));
  });
});
