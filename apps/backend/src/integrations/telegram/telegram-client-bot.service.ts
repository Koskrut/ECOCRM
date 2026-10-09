import { BadRequestException, Inject, Injectable, Logger, forwardRef } from "@nestjs/common";
import {
  DeliveryMethod,
  MessageDirection,
  PaymentMethod,
  PaymentType,
} from "@prisma/client";
import { signJwt } from "../../auth/jwt";
import { ContactsService } from "../../contacts/contacts.service";
import { IntegrationPortsService } from "../../integration-ports/integration-ports.service";
import { PrismaService } from "../../prisma/prisma.service";
import { ProductStore } from "../../products/product.store";
import { SettingsService } from "../../settings/settings.service";
import { UKRAINE_REGIONS } from "../../store/checkout/uk-regions";
import { StoreCartService } from "../../store/cart/store-cart.service";
import { StoreCheckoutPaymentLinkService } from "../../store/checkout/store-checkout-payment-link.service";
import { StoreCheckoutService } from "../../store/checkout/store-checkout.service";
import type { StoreCheckoutDto } from "../../store/checkout/dto/store-checkout.dto";
import {
  CATALOG_PAGE_SIZE,
  CITY_RESULTS_LIMIT,
  CLIENT_MENU_KEYBOARD,
  MENU_CART,
  MENU_CATALOG,
  MENU_MANAGER,
  MENU_ORDERS,
  ORDERS_PAGE_SIZE,
  TELEGRAM_CANCELLED,
  TELEGRAM_EXISTING_CLIENT,
  TELEGRAM_HELP,
  TELEGRAM_MANAGER_PROMPT,
  TELEGRAM_PHONE_SAVED_NEW,
  TELEGRAM_PHONE_SAVED_NO_CRM,
  TELEGRAM_WELCOME,
  WAREHOUSE_RESULTS_LIMIT,
  cartSessionId,
  humanOrderStage,
  type InlineBtn,
} from "./telegram-client.constants";
import {
  TelegramBotSessionService,
  type BotSessionPayload,
} from "./telegram-bot-session.service";
import { TelegramService } from "./telegram.service";
import type { ParsedInbound } from "./telegram.types";

export type ClientTurnResult = {
  /** Bot consumed the update (menu / wizard / command). */
  handled: boolean;
  /** Whether CRM managers should get an inbox notification. */
  notifyManager: boolean;
};

type NpCityHit = { Ref?: string; ref?: string; Description?: string; description?: string; Present?: string };
type NpWhHit = {
  Ref?: string;
  ref?: string;
  Description?: string;
  description?: string;
  Number?: string;
  number?: string;
};
type NpStreetHit = {
  Ref?: string;
  ref?: string;
  Description?: string;
  description?: string;
};

@Injectable()
export class TelegramClientBotService {
  private readonly logger = new Logger(TelegramClientBotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: TelegramBotSessionService,
    private readonly cart: StoreCartService,
    private readonly checkout: StoreCheckoutService,
    private readonly paymentLinks: StoreCheckoutPaymentLinkService,
    private readonly products: ProductStore,
    private readonly settings: SettingsService,
    private readonly integrations: IntegrationPortsService,
    private readonly contacts: ContactsService,
    @Inject(forwardRef(() => TelegramService)) private readonly telegram: TelegramService,
  ) {}

  /**
   * Handle menu buttons, commands, callbacks and in-wizard text.
   * Returns notifyManager=false when the update is bot UX (not free-text for staff).
   */
  async handleClientTurn(params: {
    parsed: ParsedInbound;
    conversationId: string;
    contactId: string | null;
    leadId: string | null;
    callbackQueryId?: string | null;
  }): Promise<ClientTurnResult> {
    const { parsed, conversationId, contactId, leadId } = params;
    const text = parsed.text?.trim() ?? "";
    const lower = text.toLowerCase();

    if (params.callbackQueryId) {
      try {
        await this.telegram.answerCallbackQuery(params.callbackQueryId);
      } catch {
        /* ignore expired callbacks */
      }
    }

    // Global cancel / menu
    if (lower === "/cancel" || lower === "/menu") {
      await this.sessions.resetIdle(parsed.userId);
      await this.replyMenu(parsed.chatId, conversationId, lower === "/cancel" ? TELEGRAM_CANCELLED : "Головне меню:");
      return { handled: true, notifyManager: false };
    }
    if (lower === "/help") {
      await this.replyMenu(parsed.chatId, conversationId, TELEGRAM_HELP);
      return { handled: true, notifyManager: false };
    }
    if (
      lower === "/start" ||
      (lower.startsWith("/start") && text.length <= 6) ||
      (lower.startsWith("/start ") && !text.slice(7).trim())
    ) {
      await this.sessions.resetIdle(parsed.userId);
      if (contactId || leadId) {
        await this.replyMenu(parsed.chatId, conversationId, TELEGRAM_WELCOME);
      } else {
        await this.telegram.sendMessageToChat(parsed.chatId, TELEGRAM_WELCOME, {
          requestContactButton: true,
        });
      }
      return { handled: true, notifyManager: false };
    }
    if (lower.startsWith("/start ")) {
      // Deep-link token already consumed by TelegramService; show menu if linked.
      await this.sessions.resetIdle(parsed.userId);
      if (contactId || leadId) {
        await this.replyMenu(parsed.chatId, conversationId, TELEGRAM_WELCOME);
      } else {
        await this.telegram.sendMessageToChat(parsed.chatId, TELEGRAM_WELCOME, {
          requestContactButton: true,
        });
      }
      return { handled: true, notifyManager: false };
    }

    // Contact share — always acknowledge and show menu (never notify manager).
    if (parsed.phone) {
      await this.sessions.resetIdle(parsed.userId);
      let msg = TELEGRAM_PHONE_SAVED_NO_CRM;
      if (contactId) msg = TELEGRAM_EXISTING_CLIENT;
      else if (leadId) msg = TELEGRAM_PHONE_SAVED_NEW;
      await this.replyMenu(parsed.chatId, conversationId, msg);
      return { handled: true, notifyManager: false };
    }

    // Reply-keyboard menu
    if (text === MENU_CATALOG || lower === "/catalog") {
      await this.sessions.resetIdle(parsed.userId);
      await this.showCatalog(parsed, conversationId, 1, undefined);
      return { handled: true, notifyManager: false };
    }
    if (text === MENU_CART || lower === "/cart") {
      await this.sessions.resetIdle(parsed.userId);
      await this.showCart(parsed, conversationId);
      return { handled: true, notifyManager: false };
    }
    if (text === MENU_ORDERS || lower === "/orders") {
      await this.sessions.resetIdle(parsed.userId);
      await this.showOrders(parsed, conversationId, contactId, leadId, 1);
      return { handled: true, notifyManager: false };
    }
    if (text === MENU_MANAGER) {
      await this.sessions.resetIdle(parsed.userId);
      await this.replyMenu(parsed.chatId, conversationId, TELEGRAM_MANAGER_PROMPT);
      return { handled: true, notifyManager: false };
    }

    // Callbacks
    if (parsed.isCallback && text) {
      await this.handleCallback(parsed, conversationId, contactId, leadId, text);
      return { handled: true, notifyManager: false };
    }

    // Wizard text states
    const session = await this.sessions.get(parsed.userId);
    if (session.state !== "idle" && text && !parsed.isCallback) {
      await this.handleWizardText(parsed, conversationId, contactId, leadId, session.state, session.payload, text);
      return { handled: true, notifyManager: false };
    }

    // Free text in idle → manager
    return { handled: false, notifyManager: true };
  }

  private async handleCallback(
    parsed: ParsedInbound,
    conversationId: string,
    contactId: string | null,
    leadId: string | null,
    data: string,
  ): Promise<void> {
    const [ns, action, ...rest] = data.split(":");

    if (ns === "cat") {
      if (action === "p") {
        const page = Number(rest[0]) || 1;
        const session = await this.sessions.get(parsed.userId);
        await this.showCatalog(parsed, conversationId, page, session.payload.catalogSearch);
        return;
      }
      if (action === "s") {
        await this.sessions.set(parsed.userId, "catalog_search", {});
        await this.replyMenu(
          parsed.chatId,
          conversationId,
          "Напишіть назву або артикул товару для пошуку:",
        );
        return;
      }
      if (action === "i" && rest[0]) {
        await this.showProduct(parsed, conversationId, rest[0]);
        return;
      }
      if (action === "a" && rest[0]) {
        const qty = Math.max(1, Number(rest[1]) || 1);
        await this.addToCart(parsed, conversationId, rest[0], qty);
        return;
      }
    }

    if (ns === "cart") {
      if (action === "clr") {
        await this.cart.clearCart({ sessionId: cartSessionId(parsed.userId) });
        await this.replyMenu(parsed.chatId, conversationId, "Кошик очищено.");
        return;
      }
      if (action === "chk") {
        await this.startCheckout(parsed, conversationId, contactId);
        return;
      }
      if (action === "show") {
        await this.showCart(parsed, conversationId);
        return;
      }
    }

    if (ns === "ord") {
      if (action === "p") {
        const page = Number(rest[0]) || 1;
        await this.showOrders(parsed, conversationId, contactId, leadId, page);
        return;
      }
      if (action === "d" && rest[0]) {
        await this.showOrderDetail(parsed, conversationId, contactId, leadId, rest[0]);
        return;
      }
      if (action === "pay" && rest[0]) {
        await this.sendOrderPayLink(parsed, conversationId, contactId, leadId, rest[0]);
        return;
      }
      if (action === "rep" && rest[0]) {
        await this.repeatOrder(parsed, conversationId, contactId, leadId, rest[0]);
        return;
      }
    }

    if (ns === "chk") {
      await this.handleCheckoutCallback(parsed, conversationId, contactId, action, rest);
    }
  }

  private async handleWizardText(
    parsed: ParsedInbound,
    conversationId: string,
    contactId: string | null,
    leadId: string | null,
    state: string,
    payload: BotSessionPayload,
    text: string,
  ): Promise<void> {
    if (state === "catalog_search") {
      await this.sessions.set(parsed.userId, "idle", { catalogSearch: text });
      await this.showCatalog(parsed, conversationId, 1, text);
      return;
    }
    if (state === "checkout_city") {
      await this.searchCities(parsed, conversationId, payload, text);
      return;
    }
    if (state === "checkout_warehouse_q") {
      await this.searchWarehouses(parsed, conversationId, payload, text);
      return;
    }
    if (state === "checkout_street") {
      await this.searchStreets(parsed, conversationId, payload, text);
      return;
    }
    if (state === "checkout_building") {
      const next = await this.sessions.patchPayload(parsed.userId, "checkout_flat", {
        ...payload,
        building: text,
      });
      await this.replyMenu(
        parsed.chatId,
        conversationId,
        "Квартира / офіс (або «-» якщо немає):",
      );
      void next;
      return;
    }
    if (state === "checkout_flat") {
      const flat = text === "-" ? "" : text;
      const next = await this.sessions.patchPayload(parsed.userId, "checkout_comment", {
        ...payload,
        flat,
      });
      await this.askComment(parsed, conversationId, next);
      return;
    }
    if (state === "checkout_comment") {
      const comment = text === "-" ? undefined : text;
      const next = { ...payload, comment };
      await this.sessions.set(parsed.userId, "idle", next);
      await this.finishCheckout(parsed, conversationId, contactId, next);
      return;
    }
    void leadId;
  }

  // ─── Catalog ─────────────────────────────────────────────────────────────

  private async showCatalog(
    parsed: ParsedInbound,
    conversationId: string,
    page: number,
    search: string | undefined,
  ): Promise<void> {
    const safePage = Math.max(1, page);
    const pageSize = CATALOG_PAGE_SIZE;
    const { items, total } = await this.products.listActive(search?.trim() || undefined, undefined, {
      page: safePage,
      pageSize,
      offset: (safePage - 1) * pageSize,
      limit: pageSize,
    });
    const rates = await this.settings.getExchangeRates();
    const uahPerUsd = rates.UAH_TO_USD > 0 ? 1 / rates.UAH_TO_USD : 41;

    if (items.length === 0) {
      const buttons: InlineBtn[][] = [
        [{ text: "🔍 Пошук", callback_data: "cat:s" }],
        [{ text: "🛒 Кошик", callback_data: "cart:show" }],
      ];
      await this.replyInline(
        parsed.chatId,
        conversationId,
        search ? `Нічого не знайдено за «${search}».` : "Каталог порожній.",
        buttons,
      );
      return;
    }

    const lines = items.map((p, idx) => {
      const uah = Math.round(p.basePrice * uahPerUsd);
      const stock = p.stock > 0 ? "в наявності" : "немає";
      return `${(safePage - 1) * CATALOG_PAGE_SIZE + idx + 1}. ${p.name}\n   ${uah} грн · ${stock}`;
    });
    const pages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
    const nav: InlineBtn[] = [];
    if (safePage > 1) nav.push({ text: "⬅️", callback_data: `cat:p:${safePage - 1}` });
    nav.push({ text: `${safePage}/${pages}`, callback_data: `cat:p:${safePage}` });
    if (safePage < pages) nav.push({ text: "➡️", callback_data: `cat:p:${safePage + 1}` });

    const productRows: InlineBtn[][] = items.map((p) => [
      { text: p.name.slice(0, 40), callback_data: `cat:i:${p.id}` },
    ]);

    await this.sessions.patchPayload(parsed.userId, "idle", {
      catalogPage: safePage,
      catalogSearch: search,
      catalogHits: items.map((p) => ({ id: p.id, name: p.name })),
    });

    await this.replyInline(
      parsed.chatId,
      conversationId,
      `Каталог${search ? ` · «${search}»` : ""} (${total}):\n\n${lines.join("\n\n")}`,
      [...productRows, nav.length ? nav : [], [{ text: "🔍 Пошук", callback_data: "cat:s" }], [{ text: "🛒 Кошик", callback_data: "cart:show" }]].filter(
        (r) => r.length > 0,
      ),
    );
  }

  private async showProduct(
    parsed: ParsedInbound,
    conversationId: string,
    productId: string,
  ): Promise<void> {
    const p = await this.products.findActiveById(productId);
    if (!p) {
      await this.replyMenu(parsed.chatId, conversationId, "Товар не знайдено.");
      return;
    }
    const rates = await this.settings.getExchangeRates();
    const uahPerUsd = rates.UAH_TO_USD > 0 ? 1 / rates.UAH_TO_USD : 41;
    const uah = Math.round(p.basePrice * uahPerUsd);
    const caption = `${p.name}\nАртикул: ${p.sku}\nЦіна: ${uah} грн\n${p.stock > 0 ? `В наявності: ${p.stock}` : "Немає в наявності"}`;
    const buttons: InlineBtn[][] = [];
    if (p.stock > 0) {
      buttons.push([
        { text: "+1", callback_data: `cat:a:${p.id}:1` },
        { text: "+2", callback_data: `cat:a:${p.id}:2` },
        { text: "+5", callback_data: `cat:a:${p.id}:5` },
      ]);
    }
    buttons.push([{ text: "🛒 Кошик", callback_data: "cart:show" }]);
    buttons.push([{ text: "⬅️ Каталог", callback_data: "cat:p:1" }]);

    if (p.primaryImageUrl) {
      try {
        const { messageId } = await this.telegram.sendPhotoToChat(parsed.chatId, p.primaryImageUrl, {
          caption,
          inlineKeyboard: buttons,
          menuKeyboard: CLIENT_MENU_KEYBOARD,
        });
        await this.recordOutbound(conversationId, caption, messageId);
        return;
      } catch (err) {
        this.logger.debug(`sendPhoto failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await this.replyInline(parsed.chatId, conversationId, caption, buttons);
  }

  private async addToCart(
    parsed: ParsedInbound,
    conversationId: string,
    productId: string,
    qty: number,
  ): Promise<void> {
    try {
      const cart = await this.cart.addItem(
        { sessionId: cartSessionId(parsed.userId) },
        productId,
        qty,
      );
      await this.replyInline(
        parsed.chatId,
        conversationId,
        `Додано до кошика. Разом позицій: ${cart.items.length}, сума: ${Math.round(cart.subtotal * cart.uahPerUsd)} грн.`,
        [
          [{ text: "🛒 Кошик", callback_data: "cart:show" }],
          [{ text: "✅ Оформити", callback_data: "cart:chk" }],
          [{ text: "⬅️ Каталог", callback_data: "cat:p:1" }],
        ],
      );
    } catch (err) {
      const msg = err instanceof BadRequestException ? String(err.message) : "Не вдалося додати товар.";
      await this.replyMenu(parsed.chatId, conversationId, msg);
    }
  }

  // ─── Cart ────────────────────────────────────────────────────────────────

  private async showCart(parsed: ParsedInbound, conversationId: string): Promise<void> {
    const cart = await this.cart.getCart({ sessionId: cartSessionId(parsed.userId) });
    if (!cart.items.length) {
      await this.replyInline(parsed.chatId, conversationId, "Кошик порожній.", [
        [{ text: "🛍 Каталог", callback_data: "cat:p:1" }],
      ]);
      return;
    }
    const lines = cart.items.map(
      (i) => `• ${i.name} × ${i.qty} = ${Math.round(i.lineTotal * cart.uahPerUsd)} грн`,
    );
    const totalUah = Math.round(cart.subtotal * cart.uahPerUsd);
    await this.replyInline(
      parsed.chatId,
      conversationId,
      `Кошик:\n${lines.join("\n")}\n\nРазом: ${totalUah} грн`,
      [
        [{ text: "✅ Оформити", callback_data: "cart:chk" }],
        [{ text: "🗑 Очистити", callback_data: "cart:clr" }],
        [{ text: "🛍 Каталог", callback_data: "cat:p:1" }],
      ],
    );
  }

  // ─── Orders ──────────────────────────────────────────────────────────────

  private async resolveContactId(
    contactId: string | null,
    leadId: string | null,
  ): Promise<string | null> {
    if (contactId) return contactId;
    if (!leadId) return null;
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { contactId: true },
    });
    return lead?.contactId ?? null;
  }

  private async showOrders(
    parsed: ParsedInbound,
    conversationId: string,
    contactId: string | null,
    leadId: string | null,
    page: number,
  ): Promise<void> {
    const resolved = await this.resolveContactId(contactId, leadId);
    if (!resolved) {
      await this.replyMenu(
        parsed.chatId,
        conversationId,
        "Щоб бачити замовлення, поділіться номером телефону.",
      );
      return;
    }
    const safePage = Math.max(1, page);
    const take = ORDERS_PAGE_SIZE;
    const skip = (safePage - 1) * take;
    const where = { OR: [{ clientId: resolved }, { contactId: resolved }] };
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: {
          id: true,
          orderNumber: true,
          orderStage: true,
          status: true,
          debtAmount: true,
          createdAt: true,
        },
      }),
      this.prisma.order.count({ where }),
    ]);
    if (items.length === 0) {
      await this.replyMenu(parsed.chatId, conversationId, "У CRM поки немає ваших замовлень.");
      return;
    }
    const lines = items.map((o) => {
      const stage = humanOrderStage(o.orderStage, o.status);
      const debt = Number(o.debtAmount);
      const debtPart = debt > 0.00001 ? ` · борг ${debt.toFixed(0)}` : "";
      return `№${o.orderNumber} — ${stage}${debtPart}`;
    });
    const pages = Math.max(1, Math.ceil(total / take));
    const rows: InlineBtn[][] = items.map((o) => [
      { text: `№${o.orderNumber}`, callback_data: `ord:d:${o.id}` },
    ]);
    const nav: InlineBtn[] = [];
    if (safePage > 1) nav.push({ text: "⬅️", callback_data: `ord:p:${safePage - 1}` });
    nav.push({ text: `${safePage}/${pages}`, callback_data: `ord:p:${safePage}` });
    if (safePage < pages) nav.push({ text: "➡️", callback_data: `ord:p:${safePage + 1}` });
    await this.replyInline(
      parsed.chatId,
      conversationId,
      `Ваші замовлення:\n${lines.join("\n")}`,
      [...rows, nav.length ? nav : []].filter((r) => r.length > 0),
    );
  }

  private async showOrderDetail(
    parsed: ParsedInbound,
    conversationId: string,
    contactId: string | null,
    leadId: string | null,
    orderId: string,
  ): Promise<void> {
    const resolved = await this.resolveContactId(contactId, leadId);
    if (!resolved) {
      await this.replyMenu(parsed.chatId, conversationId, "Спочатку поділіться номером телефону.");
      return;
    }
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        OR: [{ clientId: resolved }, { contactId: resolved }],
      },
      include: {
        items: { include: { product: { select: { name: true, sku: true } } }, take: 20 },
        ttns: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: {
            documentNumber: true,
            statusText: true,
            estimatedDeliveryDate: true,
          },
        },
      },
    });
    if (!order) {
      await this.replyMenu(parsed.chatId, conversationId, "Замовлення не знайдено.");
      return;
    }
    const stage = humanOrderStage(order.orderStage, order.status);
    const lines = [
      `Замовлення №${order.orderNumber}`,
      `Статус: ${stage}`,
      `Сума: ${Number(order.totalAmount).toFixed(2)} ${order.currency}`,
      `Сплачено: ${Number(order.paidAmount).toFixed(2)}`,
      `Борг: ${Number(order.debtAmount).toFixed(2)}`,
    ];
    const ttn = order.ttns[0];
    if (ttn?.documentNumber) lines.push(`ТТН: ${ttn.documentNumber}`);
    if (ttn?.statusText) lines.push(`НП: ${ttn.statusText}`);
    if (ttn?.estimatedDeliveryDate) {
      lines.push(`Орієнтовна дата: ${ttn.estimatedDeliveryDate.toLocaleDateString("uk-UA")}`);
    }
    if (order.items.length) {
      lines.push("", "Позиції:");
      for (const i of order.items) {
        lines.push(`• ${i.product?.name ?? i.productNameSnapshot ?? "?"} × ${i.qty}`);
      }
    }
    const buttons: InlineBtn[][] = [];
    if (Number(order.debtAmount) > 0.00001) {
      buttons.push([{ text: "💳 Оплатити", callback_data: `ord:pay:${order.id}` }]);
    }
    buttons.push([{ text: "🔁 Повторити", callback_data: `ord:rep:${order.id}` }]);
    buttons.push([{ text: "⬅️ Список", callback_data: "ord:p:1" }]);
    await this.replyInline(parsed.chatId, conversationId, lines.join("\n"), buttons);
  }

  private async sendOrderPayLink(
    parsed: ParsedInbound,
    conversationId: string,
    contactId: string | null,
    leadId: string | null,
    orderId: string,
  ): Promise<void> {
    const resolved = await this.resolveContactId(contactId, leadId);
    if (!resolved) {
      await this.replyMenu(parsed.chatId, conversationId, "Спочатку поділіться номером телефону.");
      return;
    }
    const url = await this.buildPayUrl(orderId, resolved);
    if (!url) {
      await this.replyMenu(
        parsed.chatId,
        conversationId,
        "Посилання на оплату зараз недоступне. Напишіть менеджеру — допоможемо.",
      );
      return;
    }
    await this.replyMenu(parsed.chatId, conversationId, `Оплата замовлення:\n${url}`);
  }

  private async repeatOrder(
    parsed: ParsedInbound,
    conversationId: string,
    contactId: string | null,
    leadId: string | null,
    orderId: string,
  ): Promise<void> {
    const resolved = await this.resolveContactId(contactId, leadId);
    if (!resolved) return;
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        OR: [{ clientId: resolved }, { contactId: resolved }],
      },
      include: { items: { select: { productId: true, qty: true } } },
    });
    if (!order) {
      await this.replyMenu(parsed.chatId, conversationId, "Замовлення не знайдено.");
      return;
    }
    const sessionId = cartSessionId(parsed.userId);
    await this.cart.clearCart({ sessionId });
    let added = 0;
    for (const item of order.items) {
      if (!item.productId) continue;
      try {
        await this.cart.addItem({ sessionId }, item.productId, item.qty);
        added += 1;
      } catch {
        /* skip unavailable */
      }
    }
    if (!added) {
      await this.replyMenu(parsed.chatId, conversationId, "Не вдалося додати товари (немає в наявності).");
      return;
    }
    await this.showCart(parsed, conversationId);
  }

  // ─── Checkout wizard ─────────────────────────────────────────────────────

  private async startCheckout(
    parsed: ParsedInbound,
    conversationId: string,
    contactId: string | null,
  ): Promise<void> {
    const cart = await this.cart.getCart({ sessionId: cartSessionId(parsed.userId) });
    if (!cart.items.length) {
      await this.replyMenu(parsed.chatId, conversationId, "Кошик порожній.");
      return;
    }
    if (!contactId) {
      const account = await this.prisma.telegramAccount.findUnique({
        where: { telegramUserId: parsed.userId },
        select: { phone: true, contactId: true },
      });
      if (!account?.phone && !account?.contactId) {
        await this.telegram.sendMessageToChat(
          parsed.chatId,
          "Для оформлення поділіться номером телефону:",
          { requestContactButton: true },
        );
        return;
      }
    }
    await this.sessions.set(parsed.userId, "idle", {});
    const regionRows: InlineBtn[][] = [];
    for (let i = 0; i < UKRAINE_REGIONS.length; i += 2) {
      const row: InlineBtn[] = [
        { text: UKRAINE_REGIONS[i], callback_data: `chk:reg:${i}` },
      ];
      if (UKRAINE_REGIONS[i + 1]) {
        row.push({ text: UKRAINE_REGIONS[i + 1], callback_data: `chk:reg:${i + 1}` });
      }
      regionRows.push(row);
    }
    // 25 regions → 13 rows (Telegram allows up to 100 buttons).
    await this.replyInline(
      parsed.chatId,
      conversationId,
      "Оберіть область доставки (потрібна для нового клієнта й призначення менеджера):",
      regionRows,
    );
  }

  private async handleCheckoutCallback(
    parsed: ParsedInbound,
    conversationId: string,
    contactId: string | null,
    action: string,
    rest: string[],
  ): Promise<void> {
    const session = await this.sessions.get(parsed.userId);
    let payload = { ...session.payload };

    if (action === "reg" && rest[0] != null) {
      const idx = Number(rest[0]);
      const region = UKRAINE_REGIONS[idx];
      if (!region) return;
      payload = await this.sessions.patchPayload(parsed.userId, "idle", { ...payload, region });
      await this.replyInline(parsed.chatId, conversationId, "Спосіб доставки:", [
        [{ text: "🏪 Самовивіз", callback_data: "chk:del:pickup" }],
        [{ text: "📦 Нова Пошта", callback_data: "chk:del:np" }],
      ]);
      return;
    }

    if (action === "del") {
      if (rest[0] === "pickup") {
        payload = await this.sessions.patchPayload(parsed.userId, "idle", {
          ...payload,
          deliveryMethod: "PICKUP",
        });
        await this.askPayment(parsed, conversationId);
        return;
      }
      if (rest[0] === "np") {
        payload = await this.sessions.patchPayload(parsed.userId, "idle", {
          ...payload,
          deliveryMethod: "NOVA_POSHTA",
        });
        const resolvedContact =
          contactId ??
          (
            await this.prisma.telegramAccount.findUnique({
              where: { telegramUserId: parsed.userId },
              select: { contactId: true },
            })
          )?.contactId ??
          null;
        if (resolvedContact) {
          try {
            const profiles = await this.contacts.listShippingProfiles(resolvedContact);
            const items = profiles.items.filter((p) => p.recipientType !== "COMPANY");
            if (items.length > 0) {
              const rows: InlineBtn[][] = items.slice(0, 5).map((p) => [
                {
                  text: (p.label || p.cityName || "Адреса").slice(0, 40),
                  callback_data: `chk:prof:${p.id}`,
                },
              ]);
              rows.push([{ text: "➕ Нова адреса", callback_data: "chk:prof:new" }]);
              rows.push([{ text: "🏢 На компанію (менеджер)", callback_data: "chk:company" }]);
              await this.replyInline(
                parsed.chatId,
                conversationId,
                "Оберіть збережену адресу або нову:",
                rows,
              );
              return;
            }
          } catch {
            /* fall through */
          }
        }
        await this.askDeliveryType(parsed, conversationId);
        return;
      }
    }

    if (action === "company") {
      await this.sessions.resetIdle(parsed.userId);
      await this.replyMenu(
        parsed.chatId,
        conversationId,
        "Оформлення на компанію (ЄДРПОУ) робить менеджер. Напишіть реквізити в чат — передамо в CRM.",
      );
      return;
    }

    if (action === "prof") {
      if (rest[0] === "new") {
        await this.askDeliveryType(parsed, conversationId);
        return;
      }
      if (rest[0]) {
        payload = await this.sessions.patchPayload(parsed.userId, "idle", {
          ...payload,
          profileId: rest[0],
          deliveryMethod: "NOVA_POSHTA",
        });
        await this.askPayment(parsed, conversationId);
        return;
      }
    }

    if (action === "dtype") {
      const map: Record<string, "WAREHOUSE" | "POSTOMAT" | "ADDRESS"> = {
        wh: "WAREHOUSE",
        pm: "POSTOMAT",
        addr: "ADDRESS",
      };
      const deliveryType = map[rest[0] ?? ""];
      if (!deliveryType) return;
      payload = await this.sessions.patchPayload(parsed.userId, "checkout_city", {
        ...payload,
        deliveryType,
        deliveryMethod: "NOVA_POSHTA",
        profileId: undefined,
      });
      await this.replyMenu(
        parsed.chatId,
        conversationId,
        "Напишіть назву міста (як у Новій Пошті):",
      );
      return;
    }

    if (action === "city" && rest[0] != null) {
      const idx = Number(rest[0]);
      const hit = payload.cityHits?.[idx];
      if (!hit) return;
      payload = await this.sessions.patchPayload(
        parsed.userId,
        payload.deliveryType === "ADDRESS" ? "checkout_street" : "checkout_warehouse_q",
        { ...payload, cityRef: hit.ref, cityName: hit.name },
      );
      if (payload.deliveryType === "ADDRESS") {
        await this.replyMenu(parsed.chatId, conversationId, "Напишіть назву вулиці:");
      } else {
        await this.replyMenu(
          parsed.chatId,
          conversationId,
          payload.deliveryType === "POSTOMAT"
            ? "Напишіть номер або назву поштомату (або «-» щоб показати список):"
            : "Напишіть номер/назву відділення (або «-» щоб показати список):",
        );
      }
      return;
    }

    if (action === "wh" && rest[0] != null) {
      const idx = Number(rest[0]);
      const hit = payload.warehouseHits?.[idx];
      if (!hit) return;
      payload = await this.sessions.patchPayload(parsed.userId, "checkout_comment", {
        ...payload,
        warehouseRef: hit.ref,
        warehouseName: hit.name,
      });
      await this.askComment(parsed, conversationId, payload);
      return;
    }

    if (action === "st" && rest[0] != null) {
      const idx = Number(rest[0]);
      const hit = payload.streetHits?.[idx];
      if (!hit) return;
      payload = await this.sessions.patchPayload(parsed.userId, "checkout_building", {
        ...payload,
        streetRef: hit.ref,
        streetName: hit.name,
      });
      await this.replyMenu(parsed.chatId, conversationId, "Номер будинку:");
      return;
    }

    if (action === "pay") {
      const method = rest[0];
      if (method === "cod") {
        payload = await this.sessions.patchPayload(parsed.userId, "idle", {
          ...payload,
          paymentMethod: PaymentMethod.CASH,
          paymentType: PaymentType.DEFERRED,
        });
      } else if (method === "pre") {
        payload = await this.sessions.patchPayload(parsed.userId, "idle", {
          ...payload,
          paymentMethod: PaymentMethod.FOP,
          paymentType: PaymentType.PREPAYMENT,
        });
      } else {
        return;
      }
      // Address complete (pickup / saved profile / warehouse or street collected) → comment.
      if (this.isCheckoutAddressReady(payload)) {
        await this.askComment(parsed, conversationId, payload);
        return;
      }
      await this.continueCheckoutAddress(parsed, conversationId, payload);
      return;
    }

    if (action === "go") {
      if (!this.isCheckoutAddressReady(payload) || !payload.region || !payload.paymentType) {
        await this.replyMenu(
          parsed.chatId,
          conversationId,
          "Оформлення ще не завершене. Відкрийте кошик і натисніть «Оформити» знову.",
        );
        return;
      }
      await this.finishCheckout(parsed, conversationId, contactId, payload);
    }
  }

  private isCheckoutAddressReady(payload: BotSessionPayload): boolean {
    if (payload.deliveryMethod === "PICKUP") return true;
    if (payload.profileId) return true;
    if (payload.warehouseRef) return true;
    if (payload.building && payload.streetRef && payload.cityRef) return true;
    return false;
  }

  /** Resume NP address collection after payment (or stale inline buttons). */
  private async continueCheckoutAddress(
    parsed: ParsedInbound,
    conversationId: string,
    payload: BotSessionPayload,
  ): Promise<void> {
    if (payload.deliveryMethod !== "NOVA_POSHTA") {
      await this.startCheckout(parsed, conversationId, null);
      return;
    }
    if (!payload.deliveryType) {
      await this.askDeliveryType(parsed, conversationId);
      return;
    }
    if (!payload.cityRef) {
      await this.sessions.patchPayload(parsed.userId, "checkout_city", payload);
      await this.replyMenu(
        parsed.chatId,
        conversationId,
        "Напишіть назву міста (як у Новій Пошті):",
      );
      return;
    }
    if (payload.deliveryType === "ADDRESS") {
      if (!payload.streetRef) {
        await this.sessions.patchPayload(parsed.userId, "checkout_street", payload);
        await this.replyMenu(parsed.chatId, conversationId, "Напишіть назву вулиці:");
        return;
      }
      await this.sessions.patchPayload(parsed.userId, "checkout_building", payload);
      await this.replyMenu(parsed.chatId, conversationId, "Номер будинку:");
      return;
    }
    await this.sessions.patchPayload(parsed.userId, "checkout_warehouse_q", payload);
    await this.replyMenu(
      parsed.chatId,
      conversationId,
      payload.deliveryType === "POSTOMAT"
        ? "Напишіть номер або назву поштомату (або «-» щоб показати список):"
        : "Напишіть номер/назву відділення (або «-» щоб показати список):",
    );
  }

  private async askDeliveryType(parsed: ParsedInbound, conversationId: string): Promise<void> {
    await this.replyInline(parsed.chatId, conversationId, "Тип доставки Новою Поштою:", [
      [{ text: "Відділення", callback_data: "chk:dtype:wh" }],
      [{ text: "Поштомат", callback_data: "chk:dtype:pm" }],
      [{ text: "Адреса", callback_data: "chk:dtype:addr" }],
      [{ text: "🏢 На компанію (менеджер)", callback_data: "chk:company" }],
    ]);
  }

  private async askPayment(parsed: ParsedInbound, conversationId: string): Promise<void> {
    await this.replyInline(parsed.chatId, conversationId, "Оплата:", [
      [{ text: "💳 Передоплата", callback_data: "chk:pay:pre" }],
      [{ text: "📦 Накладений платіж", callback_data: "chk:pay:cod" }],
    ]);
  }

  private async askComment(
    parsed: ParsedInbound,
    conversationId: string,
    _payload: BotSessionPayload,
  ): Promise<void> {
    if (!_payload.paymentType) {
      await this.sessions.patchPayload(parsed.userId, "idle", _payload);
      await this.askPayment(parsed, conversationId);
      return;
    }
    await this.sessions.patchPayload(parsed.userId, "checkout_comment", _payload);
    await this.replyInline(
      parsed.chatId,
      conversationId,
      "Коментар до замовлення (текст або «-» щоб пропустити):",
      [[{ text: "⏭ Без коментаря", callback_data: "chk:go" }]],
    );
  }

  private async searchCities(
    parsed: ParsedInbound,
    conversationId: string,
    payload: BotSessionPayload,
    q: string,
  ): Promise<void> {
    try {
      const raw = (await this.integrations.searchNpCities({
        q,
        limit: CITY_RESULTS_LIMIT,
      })) as { items?: NpCityHit[] } | NpCityHit[];
      const items = Array.isArray(raw) ? raw : (raw.items ?? []);
      const hits = items.slice(0, CITY_RESULTS_LIMIT).map((c) => ({
        ref: String(c.Ref ?? c.ref ?? ""),
        name: String(c.Description ?? c.description ?? c.Present ?? ""),
      })).filter((h) => h.ref && h.name);
      if (!hits.length) {
        await this.replyMenu(
          parsed.chatId,
          conversationId,
          "Місто не знайдено. Спробуйте іншу назву:",
        );
        return;
      }
      await this.sessions.patchPayload(parsed.userId, "checkout_city", {
        ...payload,
        cityHits: hits,
      });
      await this.replyInline(
        parsed.chatId,
        conversationId,
        "Оберіть місто:",
        hits.map((h, i) => [{ text: h.name.slice(0, 60), callback_data: `chk:city:${i}` }]),
      );
    } catch (err) {
      await this.replyMenu(
        parsed.chatId,
        conversationId,
        `Пошук міста недоступний: ${err instanceof Error ? err.message : "помилка"}`,
      );
    }
  }

  private async searchWarehouses(
    parsed: ParsedInbound,
    conversationId: string,
    payload: BotSessionPayload,
    q: string,
  ): Promise<void> {
    if (!payload.cityRef) {
      await this.sessions.set(parsed.userId, "checkout_city", payload);
      await this.replyMenu(parsed.chatId, conversationId, "Спочатку вкажіть місто:");
      return;
    }
    const query = q === "-" ? "" : q;
    try {
      const raw = (await this.integrations.searchNpWarehouses({
        cityRef: payload.cityRef,
        q: query,
        limit: WAREHOUSE_RESULTS_LIMIT,
        type: payload.deliveryType === "POSTOMAT" ? "POSTOMAT" : "WAREHOUSE",
      })) as { items?: NpWhHit[] } | NpWhHit[];
      const items = Array.isArray(raw) ? raw : (raw.items ?? []);
      const hits = items.slice(0, WAREHOUSE_RESULTS_LIMIT).map((w) => ({
        ref: String(w.Ref ?? w.ref ?? ""),
        name: String(w.Description ?? w.description ?? w.Number ?? w.number ?? ""),
      })).filter((h) => h.ref && h.name);
      if (!hits.length) {
        await this.replyMenu(
          parsed.chatId,
          conversationId,
          "Нічого не знайдено. Спробуйте інший запит або «-»:",
        );
        return;
      }
      await this.sessions.patchPayload(parsed.userId, "checkout_warehouse_q", {
        ...payload,
        warehouseHits: hits,
      });
      await this.replyInline(
        parsed.chatId,
        conversationId,
        "Оберіть відділення / поштомат:",
        hits.map((h, i) => [{ text: h.name.slice(0, 60), callback_data: `chk:wh:${i}` }]),
      );
    } catch (err) {
      await this.replyMenu(
        parsed.chatId,
        conversationId,
        `Пошук відділень недоступний: ${err instanceof Error ? err.message : "помилка"}`,
      );
    }
  }

  private async searchStreets(
    parsed: ParsedInbound,
    conversationId: string,
    payload: BotSessionPayload,
    q: string,
  ): Promise<void> {
    if (!payload.cityRef) return;
    try {
      const raw = (await this.integrations.searchNpStreets({
        cityRef: payload.cityRef,
        q,
        limit: 8,
      })) as { items?: NpStreetHit[] } | NpStreetHit[];
      const items = Array.isArray(raw) ? raw : (raw.items ?? []);
      const hits = items.slice(0, 8).map((s) => ({
        ref: String(s.Ref ?? s.ref ?? ""),
        name: String(s.Description ?? s.description ?? ""),
      })).filter((h) => h.ref && h.name);
      if (!hits.length) {
        await this.replyMenu(parsed.chatId, conversationId, "Вулицю не знайдено. Спробуйте ще:");
        return;
      }
      await this.sessions.patchPayload(parsed.userId, "checkout_street", {
        ...payload,
        streetHits: hits,
      });
      await this.replyInline(
        parsed.chatId,
        conversationId,
        "Оберіть вулицю:",
        hits.map((h, i) => [{ text: h.name.slice(0, 60), callback_data: `chk:st:${i}` }]),
      );
    } catch (err) {
      await this.replyMenu(
        parsed.chatId,
        conversationId,
        `Пошук вулиць недоступний: ${err instanceof Error ? err.message : "помилка"}`,
      );
    }
  }

  private async finishCheckout(
    parsed: ParsedInbound,
    conversationId: string,
    contactId: string | null,
    payload: BotSessionPayload,
  ): Promise<void> {
    const account = await this.prisma.telegramAccount.findUnique({
      where: { telegramUserId: parsed.userId },
    });
    const phone = account?.phone;
    if (!phone) {
      await this.telegram.sendMessageToChat(
        parsed.chatId,
        "Для оформлення потрібен номер телефону:",
        { requestContactButton: true },
      );
      return;
    }
    if (!payload.region) {
      await this.startCheckout(parsed, conversationId, contactId);
      return;
    }

    const firstName =
      account?.firstName ||
      parsed.firstName ||
      "Клієнт";
    const lastName = account?.lastName || parsed.lastName || "Telegram";

    const dto: StoreCheckoutDto = {
      phone,
      firstName,
      lastName,
      region: payload.region,
      deliveryMethod:
        payload.deliveryMethod === "PICKUP" ? DeliveryMethod.PICKUP : DeliveryMethod.NOVA_POSHTA,
      paymentMethod: (payload.paymentMethod as PaymentMethod) || PaymentMethod.FOP,
      paymentType: (payload.paymentType as PaymentType) || PaymentType.PREPAYMENT,
      comment: payload.comment,
      sessionId: cartSessionId(parsed.userId),
    };

    if (dto.deliveryMethod === DeliveryMethod.NOVA_POSHTA) {
      if (payload.profileId) {
        dto.deliveryData = { profileId: payload.profileId };
      } else {
        dto.deliveryData = {
          recipientType: "PERSON",
          deliveryType: payload.deliveryType ?? "WAREHOUSE",
          cityRef: payload.cityRef,
          cityName: payload.cityName,
          warehouseRef: payload.warehouseRef,
          warehouseName: payload.warehouseName,
          streetRef: payload.streetRef,
          streetName: payload.streetName,
          building: payload.building,
          flat: payload.flat,
          firstName,
          lastName,
          recipientPhone: phone,
          saveAsProfile: true,
        };
      }
    }

    try {
      const result = await this.checkout.checkout(dto, { autoCreateCustomer: true });
      // Persist region on Telegram lead (new clients) and link to the store contact.
      if (account?.leadId && payload.region) {
        await this.prisma.lead
          .update({
            where: { id: account.leadId },
            data: {
              region: payload.region,
              ...(result.contactId ? { contactId: result.contactId } : {}),
            },
          })
          .catch(() => {});
      }
      if (!account?.contactId && result.contactId) {
        await this.prisma.telegramAccount.updateMany({
          where: { telegramUserId: parsed.userId },
          data: { contactId: result.contactId, leadId: null },
        });
        await this.prisma.conversation.updateMany({
          where: { telegramChatId: parsed.chatId },
          data: { contactId: result.contactId, leadId: null },
        });
      }
      await this.sessions.resetIdle(parsed.userId);

      let text = `✅ Замовлення №${result.orderNumber} створено.`;
      const payUrl = await this.buildPayUrl(result.orderId, result.contactId);
      const wantsPayLink =
        !payload.paymentType || payload.paymentType === PaymentType.PREPAYMENT;
      if (payUrl && wantsPayLink) {
        text += `\n\nОплата:\n${payUrl}`;
      } else if (!payUrl && wantsPayLink) {
        text += "\n\nМенеджер надішле реквізити для оплати.";
      }
      text += "\n\nСтатус можна дивитись у «Замовлення».";
      await this.replyMenu(parsed.chatId, conversationId, text);
    } catch (err) {
      const msg =
        err instanceof BadRequestException
          ? String((err as BadRequestException).message)
          : err instanceof Error
            ? err.message
            : "Помилка оформлення";
      await this.replyMenu(
        parsed.chatId,
        conversationId,
        `Не вдалося оформити: ${msg}\nСпробуйте ще раз або напишіть менеджеру.`,
      );
    }
  }

  private async buildPayUrl(orderId: string, contactId: string): Promise<string | null> {
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    try {
      const orderPayToken = signJwt(
        { typ: "store_order_pay", orderId, contactId },
        secret,
        { expiresInSeconds: 60 * 60 * 24 * 14 },
      );
      const { payPath } = await this.paymentLinks.createPaymentLink(orderPayToken);
      const store = await this.settings.getStoreConfig();
      const base = (store.crmPayPageUrl ?? "").trim().replace(/\/+$/, "");
      if (!base) return null;
      return `${base}${payPath.startsWith("/") ? payPath : `/${payPath}`}`;
    } catch {
      return null;
    }
  }

  // ─── Send helpers (persist outbound in CRM) ──────────────────────────────

  private async replyMenu(chatId: string, conversationId: string, text: string): Promise<void> {
    const { messageId } = await this.telegram.sendMessageToChat(chatId, text, {
      menuKeyboard: CLIENT_MENU_KEYBOARD,
    });
    await this.recordOutbound(conversationId, text, messageId);
  }

  private async replyInline(
    chatId: string,
    conversationId: string,
    text: string,
    inlineKeyboard: InlineBtn[][],
  ): Promise<void> {
    const { messageId } = await this.telegram.sendMessageToChat(chatId, text, {
      menuKeyboard: CLIENT_MENU_KEYBOARD,
      inlineKeyboard,
    });
    await this.recordOutbound(conversationId, text, messageId);
  }

  private async recordOutbound(
    conversationId: string,
    text: string,
    messageId: number,
  ): Promise<void> {
    try {
      await this.prisma.message.create({
        data: {
          conversationId,
          direction: MessageDirection.OUTBOUND,
          text,
          tgMessageId: String(messageId),
          sentAt: new Date(),
          authorUserId: null,
        },
      });
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      });
    } catch (err) {
      this.logger.debug(
        `recordOutbound: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
