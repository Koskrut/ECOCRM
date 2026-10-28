import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  forwardRef,
} from "@nestjs/common";
import {
  DeliveryMethod,
  MessageDirection,
  PaymentMethod,
  PaymentType,
} from "@prisma/client";
import { signJwt } from "../../auth/jwt";
import { getPhoneNormalizedDigits } from "../../common/phone.utils";
import { ContactsService } from "../../contacts/contacts.service";
import { IntegrationPortsService } from "../../integration-ports/integration-ports.service";
import { PrismaService } from "../../prisma/prisma.service";
import { ProductStore, type CatalogBranch } from "../../products/product.store";
import { SettingsService } from "../../settings/settings.service";
import { UKRAINE_REGIONS } from "../../store/checkout/uk-regions";
import { resolveAssignedManagerForRegion } from "../../settings/org-chart-region-resolver";
import { StoreCartService } from "../../store/cart/store-cart.service";
import { StoreCheckoutPaymentLinkService } from "../../store/checkout/store-checkout-payment-link.service";
import { StoreCheckoutService } from "../../store/checkout/store-checkout.service";
import type { StoreCheckoutDto } from "../../store/checkout/dto/store-checkout.dto";
import {
  CATALOG_PAGE_SIZE,
  CATALOG_SEARCH_BUTTON,
  CATALOG_SYSTEMS,
  CITY_RESULTS_LIMIT,
  CLIENT_MENU_KEYBOARD,
  buildClientMenuKeyboard,
  MENU_CART,
  MENU_CATALOG,
  MENU_MANAGER,
  MENU_ORDERS,
  ORDERS_PAGE_SIZE,
  TELEGRAM_CANCELLED,
  TELEGRAM_CLIENT_TYPE_DOCTOR,
  TELEGRAM_CLIENT_TYPE_TECH,
  TELEGRAM_EXISTING_CLIENT,
  TELEGRAM_HELP,
  TELEGRAM_MANAGER_PROMPT,
  TELEGRAM_ONBOARDING_ASK_NAME,
  TELEGRAM_ONBOARDING_ASK_REGION,
  TELEGRAM_ONBOARDING_ASK_ROLE,
  TELEGRAM_ONBOARDING_DONE,
  TELEGRAM_ONBOARDING_DONE_NO_MANAGER,
  TELEGRAM_ONBOARDING_INTRO,
  TELEGRAM_ONBOARDING_PAUSED,
  TELEGRAM_PROFILE_REQUIRED,
  TELEGRAM_REQUEST_PHONE,
  TELEGRAM_WELCOME,
  WAREHOUSE_RESULTS_LIMIT,
  cartSessionId,
  humanOrderStage,
  type BotSessionState,
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

function formatCatalogPrice(uah: number): string {
  if (!Number.isFinite(uah) || uah <= 0) return "ціну уточніть";
  const rounded = Math.round(uah);
  return `${String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} грн`;
}

function catalogLabel(product: { name?: string | null; sku?: string | null }): {
  title: string;
  article: string | null;
} {
  const name = String(product.name ?? "").trim();
  const sku = String(product.sku ?? "").trim();
  const codeLike = /^\d{2}[.\-]\d+$/.test(name);
  if (!name || name === sku || codeLike) {
    return { title: sku || name || "Товар", article: sku && sku !== name && !codeLike ? sku : null };
  }
  return { title: name, article: sku || null };
}

function stockLabel(stock: number): string {
  if (!Number.isFinite(stock) || stock <= 0) return "немає";
  return `в наявності, ${stock} шт`;
}

function npChoiceButton(kind: "city" | "wh" | "st", hit: { ref: string; name: string }): InlineBtn | null {
  const callbackData = `chk:${kind}:${hit.ref}`;
  if (Buffer.byteLength(callbackData) > 64) return null;
  return { text: hit.name.slice(0, 60), callback_data: callbackData };
}

function usablePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 10 || digits.startsWith("0000")) return null;
  return trimmed;
}

function parsePersonName(text: string): { firstName: string; lastName: string } | null {
  const parts = text
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
  if (parts.length < 2) return null;
  if (parts.some((part) => part.length < 2)) return null;
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

function isOnboardingState(state: string): state is Extract<
  BotSessionState,
  "onboarding_name" | "onboarding_role" | "onboarding_region"
> {
  return state === "onboarding_name" || state === "onboarding_role" || state === "onboarding_region";
}

/** Keep checkout draft fields while collecting CRM profile. */
function pickCheckoutDraft(payload: BotSessionPayload): BotSessionPayload {
  const draft: BotSessionPayload = {};
  if (payload.region) draft.region = payload.region;
  if (payload.deliveryMethod) draft.deliveryMethod = payload.deliveryMethod;
  if (payload.paymentMethod) draft.paymentMethod = payload.paymentMethod;
  if (payload.paymentType) draft.paymentType = payload.paymentType;
  if (payload.profileId) draft.profileId = payload.profileId;
  if (payload.deliveryType) draft.deliveryType = payload.deliveryType;
  if (payload.cityRef) draft.cityRef = payload.cityRef;
  if (payload.cityName) draft.cityName = payload.cityName;
  if (payload.warehouseRef) draft.warehouseRef = payload.warehouseRef;
  if (payload.warehouseName) draft.warehouseName = payload.warehouseName;
  if (payload.streetRef) draft.streetRef = payload.streetRef;
  if (payload.streetName) draft.streetName = payload.streetName;
  if (payload.building) draft.building = payload.building;
  if (payload.flat) draft.flat = payload.flat;
  if (payload.comment) draft.comment = payload.comment;
  if (payload.cod != null) draft.cod = payload.cod;
  return draft;
}

function withOnboardingFields(
  draft: BotSessionPayload,
  fields: Partial<
    Pick<
      BotSessionPayload,
      | "onboardingFirstName"
      | "onboardingLastName"
      | "onboardingClientType"
      | "onboardingContactId"
    >
  >,
): BotSessionPayload {
  return { ...pickCheckoutDraft(draft), ...fields };
}

function clientSafeCheckoutError(err: unknown): string {
  const fallback = "Помилка оформлення";
  if (!(err instanceof BadRequestException)) return fallback;
  const response = err.getResponse();
  const raw =
    typeof response === "string"
      ? response
      : response && typeof response === "object" && "message" in response
        ? (response as { message?: unknown }).message
        : null;
  const text = Array.isArray(raw) ? raw.filter((part) => typeof part === "string").join(", ") : raw;
  if (typeof text !== "string" || !text.trim() || text.length > 300) return fallback;
  if (/prisma|token|stack|sql|api\.telegram/i.test(text)) return fallback;
  return text;
}

type CatalogView = {
  category?: string;
  subcategory?: string;
  categoryOnlySub?: boolean;
  subHits?: string[];
  branches?: CatalogBranch[];
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

    const earlySession = await this.sessions.get(parsed.userId);
    const inOnboarding = isOnboardingState(earlySession.state);

    // Explicit cancel always exits any wizard (including onboarding).
    if (lower === "/cancel") {
      const wasOnboarding = inOnboarding;
      await this.sessions.resetIdle(parsed.userId);
      await this.replyMenu(
        parsed.chatId,
        conversationId,
        wasOnboarding ? TELEGRAM_ONBOARDING_PAUSED : TELEGRAM_CANCELLED,
      );
      return { handled: true, notifyManager: false };
    }

    // /menu during onboarding must not wipe name/role/region progress.
    if (lower === "/menu") {
      if (inOnboarding) {
        await this.repromptOnboarding(
          parsed,
          conversationId,
          earlySession.state,
          earlySession.payload,
        );
        return { handled: true, notifyManager: false };
      }
      await this.sessions.resetIdle(parsed.userId);
      await this.replyMenu(parsed.chatId, conversationId, "Головне меню:");
      return { handled: true, notifyManager: false };
    }
    if (lower === "/help") {
      await this.replyMenu(parsed.chatId, conversationId, TELEGRAM_HELP);
      return { handled: true, notifyManager: false };
    }
    if (
      lower === "/start" ||
      lower.startsWith("/start ") ||
      (lower.startsWith("/start") && text.length <= 6)
    ) {
      await this.replyStart(parsed, conversationId, contactId, leadId);
      return { handled: true, notifyManager: false };
    }

    // Contact share — acknowledge and show the menu. A checkout waiting for a phone resumes.
    if (parsed.phone) {
      const session = await this.sessions.get(parsed.userId);
      const resolvedContactId = await this.resolveContactId(contactId, leadId);
      if (session.state === "checkout_phone") {
        if (session.payload.region && resolvedContactId) {
          await this.replyMenu(parsed.chatId, conversationId, "Номер збережено. Оформлюємо замовлення.");
          await this.finishCheckout(parsed, conversationId, resolvedContactId, session.payload);
        } else if (resolvedContactId) {
          await this.sessions.resetIdle(parsed.userId);
          await this.replyMenu(
            parsed.chatId,
            conversationId,
            "Номер збережено. Можна продовжити оформлення з кошика.",
          );
        } else {
          // Keep checkout draft; collect CRM profile before finishing the order.
          await this.startOnboarding(parsed, conversationId, session.payload);
        }
        return { handled: true, notifyManager: false };
      }
      if (resolvedContactId) {
        await this.linkTelegramToContact(parsed.userId, parsed.chatId, resolvedContactId);
        await this.sessions.resetIdle(parsed.userId);
        await this.replyMenu(parsed.chatId, conversationId, TELEGRAM_EXISTING_CLIENT);
        return { handled: true, notifyManager: false };
      }
      // Phone is new to CRM contacts — collect name, role and region.
      await this.startOnboarding(parsed, conversationId);
      return { handled: true, notifyManager: false };
    }

    // Incomplete CRM profile: keep the user in the onboarding wizard.
    if (inOnboarding) {
      if (parsed.isCallback && text.startsWith("onb:")) {
        await this.handleCallback(parsed, conversationId, contactId, leadId, text);
        return { handled: true, notifyManager: false };
      }
      const isMenuShortcut =
        text === MENU_CATALOG ||
        text === MENU_CART ||
        text === MENU_ORDERS ||
        text === MENU_MANAGER ||
        text === CATALOG_SEARCH_BUTTON ||
        lower === "/catalog" ||
        lower === "/cart" ||
        lower === "/orders";
      // Reply-keyboard taps must not be stored as a person name.
      if (isMenuShortcut || parsed.isCallback || !text) {
        await this.repromptOnboarding(
          parsed,
          conversationId,
          earlySession.state,
          earlySession.payload,
        );
        return { handled: true, notifyManager: false };
      }
      await this.handleWizardText(
        parsed,
        conversationId,
        contactId,
        leadId,
        earlySession.state,
        earlySession.payload,
        text,
      );
      return { handled: true, notifyManager: false };
    }

    // Reply-keyboard menu — commerce requires a CRM contact (profile gate).
    if (text === MENU_CATALOG || lower === "/catalog") {
      if (!(await this.ensureCrmProfile(parsed, conversationId, contactId, leadId))) {
        return { handled: true, notifyManager: false };
      }
      await this.sessions.resetIdle(parsed.userId);
      await this.showCatalogHome(parsed, conversationId);
      return { handled: true, notifyManager: false };
    }
    if (text === MENU_CART || lower === "/cart") {
      if (!(await this.ensureCrmProfile(parsed, conversationId, contactId, leadId))) {
        return { handled: true, notifyManager: false };
      }
      await this.sessions.resetIdle(parsed.userId);
      await this.showCart(parsed, conversationId);
      return { handled: true, notifyManager: false };
    }
    if (text === MENU_ORDERS || lower === "/orders") {
      if (!(await this.ensureCrmProfile(parsed, conversationId, contactId, leadId))) {
        return { handled: true, notifyManager: false };
      }
      await this.sessions.resetIdle(parsed.userId);
      await this.showOrders(parsed, conversationId, contactId, leadId, 1);
      return { handled: true, notifyManager: false };
    }
    if (text === MENU_MANAGER) {
      await this.sessions.resetIdle(parsed.userId);
      await this.replyMenu(parsed.chatId, conversationId, TELEGRAM_MANAGER_PROMPT);
      return { handled: true, notifyManager: false };
    }
    const catalogSession = await this.sessions.get(parsed.userId);
    if (catalogSession.state === "idle") {
      if (text === CATALOG_SEARCH_BUTTON) {
        if (!(await this.ensureCrmProfile(parsed, conversationId, contactId, leadId))) {
          return { handled: true, notifyManager: false };
        }
        await this.sessions.set(parsed.userId, "catalog_search", {});
        await this.replyMenu(
          parsed.chatId,
          conversationId,
          "Напишіть назву або артикул товару для пошуку:",
        );
        return { handled: true, notifyManager: false };
      }
      const system = CATALOG_SYSTEMS.find((item) => item.name === text);
      if (system) {
        if (!(await this.ensureCrmProfile(parsed, conversationId, contactId, leadId))) {
          return { handled: true, notifyManager: false };
        }
        await this.showCatalogGroup(parsed, conversationId, system.id);
        return { handled: true, notifyManager: false };
      }
    }

    // Callbacks
    if (parsed.isCallback && text) {
      const commerceNs = text.startsWith("cat:") || text.startsWith("cart:") || text.startsWith("ord:") || text.startsWith("chk:");
      if (commerceNs && !(await this.ensureCrmProfile(parsed, conversationId, contactId, leadId))) {
        return { handled: true, notifyManager: false };
      }
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
      if (action === "home") {
        await this.showCatalogHome(parsed, conversationId);
        return;
      }
      if (action === "g" && rest[0]) {
        if (!CATALOG_SYSTEMS.some((item) => item.id === rest[0])) {
          await this.showCatalogHome(parsed, conversationId);
          return;
        }
        await this.showCatalogGroup(parsed, conversationId, rest[0]);
        return;
      }
      if (action === "k" && rest[0] != null) {
        await this.openCatalogBranch(parsed, conversationId, Number(rest[0]));
        return;
      }
      if (action === "n" && rest[0] != null) {
        await this.openCatalogSubcategory(parsed, conversationId, Number(rest[0]));
        return;
      }
      if (action === "branch") {
        const session = await this.sessions.get(parsed.userId);
        if (session.payload.catalogGroup && session.payload.catalogCategory && session.payload.catalogSubHits?.length) {
          await this.showCatalogSubcategories(parsed, conversationId, session.payload);
          return;
        }
        if (session.payload.catalogGroup) {
          await this.showCatalogGroup(parsed, conversationId, session.payload.catalogGroup);
          return;
        }
        await this.showCatalogHome(parsed, conversationId);
        return;
      }
      if (action === "p") {
        const page = Number(rest[0]) || 1;
        const session = await this.sessions.get(parsed.userId);
        const group = session.payload.catalogGroup;
        const search = session.payload.catalogSearch;
        if (!group && !search) {
          await this.showCatalogHome(parsed, conversationId);
          return;
        }
        await this.showCatalog(parsed, conversationId, page, search, group, {
          category: session.payload.catalogCategory,
          subcategory: session.payload.catalogSubcategory,
          categoryOnlySub: session.payload.catalogCategoryOnlySub,
          subHits: session.payload.catalogSubHits,
          branches: session.payload.catalogBranches,
        });
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
        await this.startCheckout(parsed, conversationId, contactId, leadId);
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

    if (ns === "onb") {
      await this.handleOnboardingCallback(parsed, conversationId, action, rest);
      return;
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
    if (state === "onboarding_name") {
      const name = parsePersonName(text);
      if (!name) {
        await this.replyMenu(
          parsed.chatId,
          conversationId,
          `Потрібні ім'я та прізвище.\n\n${TELEGRAM_ONBOARDING_ASK_NAME}`,
        );
        return;
      }
      await this.sessions.set(
        parsed.userId,
        "onboarding_role",
        withOnboardingFields(payload, {
          onboardingFirstName: name.firstName,
          onboardingLastName: name.lastName,
          onboardingContactId: payload.onboardingContactId,
        }),
      );
      await this.askOnboardingRole(parsed, conversationId);
      return;
    }
    if (state === "onboarding_role" || state === "onboarding_region") {
      await this.repromptOnboarding(parsed, conversationId, state, payload);
      return;
    }
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
    if (state === "checkout_phone") {
      const phone = await this.resolveKnownPhone(parsed.userId, contactId, leadId);
      if (phone) {
        if (payload.region) {
          await this.replyMenu(parsed.chatId, conversationId, "Номер уже є в картці. Оформлюємо замовлення.");
          await this.finishCheckout(parsed, conversationId, contactId, payload);
        } else {
          await this.replyMenu(parsed.chatId, conversationId, "Номер уже є в картці клієнта. Продовжуємо оформлення.");
          await this.startCheckout(parsed, conversationId, contactId);
        }
        return;
      }
      await this.telegram.sendMessageToChat(
        parsed.chatId,
        "Щоб продовжити оформлення, поділіться номером кнопкою нижче.",
        { requestContactButton: true },
      );
      return;
    }
    if (state === "checkout_comment") {
      const comment = text === "-" ? undefined : text;
      const next = { ...payload, comment };
      await this.sessions.set(parsed.userId, "checkout_comment", next);
      const preview = comment ? `Коментар:\n${comment}` : "Без коментаря.";
      await this.replyInline(parsed.chatId, conversationId, `${preview}\n\nНатисніть «Оформити», щоб створити замовлення.`, [
        [{ text: "Оформити замовлення", callback_data: "chk:go" }],
      ]);
      return;
    }
    void leadId;
  }

  // ─── Catalog ─────────────────────────────────────────────────────────────

  private async resolveStoreMiniAppUrl(): Promise<string | null> {
    try {
      const config = await this.settings.getStoreConfig();
      const url = (config.publicStoreUrl ?? "").trim().replace(/\/+$/, "");
      return /^https:\/\//i.test(url) ? url : null;
    } catch {
      return null;
    }
  }

  private async showCatalogHome(parsed: ParsedInbound, conversationId: string): Promise<void> {
    await this.sessions.set(parsed.userId, "idle", {});
    const storeUrl = await this.resolveStoreMiniAppUrl();
    if (storeUrl) {
      await this.replyMenu(
        parsed.chatId,
        conversationId,
        "Каталог відкривається в магазині Telegram.\n\nЯкщо вікно не з’явилось — натисніть кнопку нижче.",
      );
      await this.replyInline(parsed.chatId, conversationId, "Магазин SUPREX:", [
        [{ text: "🛍 Відкрити каталог", web_app: { url: storeUrl } }],
        [{ text: "🛒 Кошик у чаті", callback_data: "cart:show" }],
      ]);
      return;
    }

    const rows: InlineBtn[][] = [];
    for (let i = 0; i < CATALOG_SYSTEMS.length; i += 2) {
      const row: InlineBtn[] = [
        { text: CATALOG_SYSTEMS[i].name, callback_data: `cat:g:${CATALOG_SYSTEMS[i].id}` },
      ];
      if (CATALOG_SYSTEMS[i + 1]) {
        row.push({
          text: CATALOG_SYSTEMS[i + 1].name,
          callback_data: `cat:g:${CATALOG_SYSTEMS[i + 1].id}`,
        });
      }
      rows.push(row);
    }
    rows.push([{ text: CATALOG_SEARCH_BUTTON, callback_data: "cat:s" }]);
    rows.push([{ text: "🛒 Кошик", callback_data: "cart:show" }]);
    // Reply keyboard replaces the share-phone button. Inline buttons cannot do that.
    await this.replyMenu(
      parsed.chatId,
      conversationId,
      "Каталог\n\nОберіть систему кнопками під наступним повідомленням.",
    );
    await this.replyInline(parsed.chatId, conversationId, "Системи:", rows);
  }

  /** System → categories. Products are shown only at a leaf, or when the system has no categories. */
  private async showCatalogGroup(
    parsed: ParsedInbound,
    conversationId: string,
    groupId: string,
  ): Promise<void> {
    const group = CATALOG_SYSTEMS.find((item) => item.id === groupId);
    if (!group) {
      await this.showCatalogHome(parsed, conversationId);
      return;
    }
    let branches: CatalogBranch[] = [];
    try {
      branches = await this.products.listCatalogTree(groupId);
    } catch (err) {
      this.logger.warn(
        `listCatalogTree failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (branches.length === 0) {
      await this.showCatalog(parsed, conversationId, 1, undefined, groupId);
      return;
    }
    const shown = branches.slice(0, 90);
    await this.sessions.set(parsed.userId, "idle", {
      catalogGroup: groupId,
      catalogBranches: shown,
    });
    const rows: InlineBtn[][] = shown.map((branch, index) => [
      { text: branch.name.slice(0, 64), callback_data: `cat:k:${index}` },
    ]);
    rows.push([{ text: "« Системи", callback_data: "cat:home" }]);
    rows.push([{ text: CATALOG_SEARCH_BUTTON, callback_data: "cat:s" }]);
    await this.replyInline(
      parsed.chatId,
      conversationId,
      `${group.name}\n\nОберіть категорію:`,
      rows,
    );
  }

  private async openCatalogBranch(
    parsed: ParsedInbound,
    conversationId: string,
    index: number,
  ): Promise<void> {
    const session = await this.sessions.get(parsed.userId);
    const branch = session.payload.catalogBranches?.[index];
    const groupId = session.payload.catalogGroup;
    if (!branch || !groupId) {
      await this.replyMenu(
        parsed.chatId,
        conversationId,
        "Список категорій застарів. Відкрийте систему ще раз.",
      );
      return;
    }
    const children = (branch.children ?? []).filter((name) => name.trim().length > 0);
    if (children.length > 0 && !branch.subcategoryOnly) {
      await this.sessions.set(parsed.userId, "idle", {
        catalogGroup: groupId,
        catalogBranches: session.payload.catalogBranches,
        catalogCategory: branch.name,
        catalogSubHits: children,
      });
      await this.showCatalogSubcategories(parsed, conversationId, {
        catalogGroup: groupId,
        catalogCategory: branch.name,
        catalogSubHits: children,
      });
      return;
    }
    await this.showCatalog(parsed, conversationId, 1, undefined, groupId, {
      category: branch.subcategoryOnly ? undefined : branch.name,
      subcategory: branch.subcategoryOnly ? branch.name : undefined,
      categoryOnlySub: Boolean(branch.subcategoryOnly),
      branches: session.payload.catalogBranches,
    });
  }

  private async openCatalogSubcategory(
    parsed: ParsedInbound,
    conversationId: string,
    index: number,
  ): Promise<void> {
    const session = await this.sessions.get(parsed.userId);
    const subcategory = session.payload.catalogSubHits?.[index];
    if (!subcategory || !session.payload.catalogGroup || !session.payload.catalogCategory) {
      await this.replyMenu(
        parsed.chatId,
        conversationId,
        "Список підкатегорій застарів. Відкрийте категорію ще раз.",
      );
      return;
    }
    await this.showCatalog(parsed, conversationId, 1, undefined, session.payload.catalogGroup, {
      category: session.payload.catalogCategory,
      subcategory,
      subHits: session.payload.catalogSubHits,
      branches: session.payload.catalogBranches,
    });
  }

  private async showCatalogSubcategories(
    parsed: ParsedInbound,
    conversationId: string,
    payload: BotSessionPayload,
  ): Promise<void> {
    const group = CATALOG_SYSTEMS.find((item) => item.id === payload.catalogGroup);
    const hits = payload.catalogSubHits ?? [];
    const rows: InlineBtn[][] = hits.map((name, index) => [
      { text: name.slice(0, 64), callback_data: `cat:n:${index}` },
    ]);
    if (payload.catalogGroup) {
      rows.push([{ text: "« Категорії", callback_data: `cat:g:${payload.catalogGroup}` }]);
    }
    rows.push([{ text: CATALOG_SEARCH_BUTTON, callback_data: "cat:s" }]);
    await this.replyInline(
      parsed.chatId,
      conversationId,
      `${group?.name ?? "Каталог"}${payload.catalogCategory ? ` · ${payload.catalogCategory}` : ""}\n\nОберіть підкатегорію:`,
      rows,
    );
  }

  private async showCatalog(
    parsed: ParsedInbound,
    conversationId: string,
    page: number,
    search: string | undefined,
    groupId?: string,
    path?: CatalogView,
  ): Promise<void> {
    const safePage = Math.max(1, page);
    const pageSize = CATALOG_PAGE_SIZE;
    const group = CATALOG_SYSTEMS.find((item) => item.id === groupId);
    const pagination = {
      page: safePage,
      pageSize,
      offset: (safePage - 1) * pageSize,
      limit: pageSize,
    };
    const categoryName = path?.categoryOnlySub ? undefined : path?.category;
    const subcategoryName = path?.categoryOnlySub ? path?.category : path?.subcategory;
    const { items, total } =
      group && (categoryName || subcategoryName)
        ? await this.products.listActiveByCatalogPath(group.id, pagination, {
            categoryName,
            subcategoryName,
          })
        : await this.products.listActive(search?.trim() || undefined, group?.id, pagination);
    const rates = await this.settings.getExchangeRates();
    const uahPerUsd = rates.UAH_TO_USD > 0 ? 1 / rates.UAH_TO_USD : 41;

    const backRow: InlineBtn[] =
      path?.subcategory && path.subHits && path.subHits.length > 0
        ? [{ text: "« Підкатегорії", callback_data: "cat:branch" }]
        : path?.category || path?.categoryOnlySub
          ? [{ text: "« Категорії", callback_data: `cat:g:${group?.id ?? ""}` }]
          : [{ text: "« Системи", callback_data: "cat:home" }];
    const remembered = {
      catalogSearch: search,
      catalogGroup: group?.id,
      catalogCategory: path?.category,
      catalogSubcategory: path?.subcategory,
      catalogCategoryOnlySub: path?.categoryOnlySub,
      catalogSubHits: path?.subHits,
      catalogBranches: path?.branches,
    };
    if (items.length === 0) {
      await this.sessions.set(parsed.userId, "idle", remembered);
      await this.replyInline(
        parsed.chatId,
        conversationId,
        search
          ? `Нічого не знайдено за «${search}».`
          : path?.category || path?.subcategory
            ? "У цій категорії поки немає товарів."
            : "У цій системі поки немає товарів.",
        [backRow, [{ text: CATALOG_SEARCH_BUTTON, callback_data: "cat:s" }], [{ text: "🛒 Кошик", callback_data: "cart:show" }]],
      );
      return;
    }

    const lines = items.map((p, idx) => {
      const label = catalogLabel(p);
      const price = formatCatalogPrice(Math.round(p.basePrice * uahPerUsd));
      const n = (safePage - 1) * CATALOG_PAGE_SIZE + idx + 1;
      const meta = [label.article, price, stockLabel(p.stock)].filter(Boolean).join(" · ");
      return `${n}. ${label.title}\n   ${meta}`;
    });
    const pages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
    const nav: InlineBtn[] = [];
    if (safePage > 1) nav.push({ text: "⬅️", callback_data: `cat:p:${safePage - 1}` });
    nav.push({ text: `${safePage}/${pages}`, callback_data: `cat:p:${safePage}` });
    if (safePage < pages) nav.push({ text: "➡️", callback_data: `cat:p:${safePage + 1}` });

    const productRows: InlineBtn[][] = items.map((p) => {
      const label = catalogLabel(p);
      const price = formatCatalogPrice(Math.round(p.basePrice * uahPerUsd));
      return [{ text: `${label.title} · ${price}`.slice(0, 60), callback_data: `cat:i:${p.id}` }];
    });

    await this.sessions.set(parsed.userId, "idle", {
      ...remembered,
      catalogPage: safePage,
      catalogHits: items.map((p) => ({ id: p.id, name: p.name })),
    });

    const crumb = [group?.name, path?.category, path?.subcategory].filter(Boolean).join(" · ");
    const title = search ? `Пошук «${search}» · ${total}` : `${crumb || "Каталог"} · ${total}`;
    await this.replyInline(
      parsed.chatId,
      conversationId,
      `${title}\n\n${lines.join("\n\n")}`,
      [
        ...productRows,
        ...(nav.length ? [nav] : []),
        backRow,
        [{ text: CATALOG_SEARCH_BUTTON, callback_data: "cat:s" }],
        [{ text: "🛒 Кошик", callback_data: "cart:show" }],
      ],
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
    const label = catalogLabel(p);
    const price = formatCatalogPrice(Math.round(p.basePrice * uahPerUsd));
    const availability = stockLabel(p.stock);
    const caption = [
      label.title,
      label.article ? `Артикул: ${label.article}` : null,
      `Ціна: ${price}`,
      availability === "немає" ? "Немає в наявності" : availability,
    ]
      .filter(Boolean)
      .join("\n");
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
      await this.replyWhenNoContact(
        parsed,
        conversationId,
        contactId,
        leadId,
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
      await this.replyWhenNoContact(
        parsed,
        conversationId,
        contactId,
        leadId,
        "Спочатку поділіться номером телефону.",
      );
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
      await this.replyWhenNoContact(
        parsed,
        conversationId,
        contactId,
        leadId,
        "Спочатку поділіться номером телефону.",
      );
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

  private async replyStart(
    parsed: ParsedInbound,
    conversationId: string,
    contactId: string | null,
    leadId: string | null,
  ): Promise<void> {
    const session = await this.sessions.get(parsed.userId);
    const resolvedContactId = await this.resolveContactId(contactId, leadId);

    // Resume mid-onboarding without wiping collected name/role.
    if (isOnboardingState(session.state)) {
      await this.repromptOnboarding(parsed, conversationId, session.state, session.payload);
      return;
    }

    if (resolvedContactId) {
      await this.linkTelegramToContact(parsed.userId, parsed.chatId, resolvedContactId);
      if (await this.startContactGapFillIfNeeded(parsed, conversationId, resolvedContactId)) {
        return;
      }
      await this.sessions.resetIdle(parsed.userId);
      await this.replyMenu(parsed.chatId, conversationId, TELEGRAM_EXISTING_CLIENT);
      return;
    }

    const phone = await this.resolveKnownPhone(parsed.userId, contactId, leadId);
    if (phone) {
      // Phone known but no CRM contact yet — finish profile (name / role / region).
      await this.startOnboarding(parsed, conversationId);
      return;
    }

    await this.sessions.resetIdle(parsed.userId);
    await this.telegram.sendMessageToChat(parsed.chatId, TELEGRAM_WELCOME, {
      requestContactButton: true,
    });
  }

  // ─── New-client onboarding ───────────────────────────────────────────────

  /**
   * Catalog / cart / orders / checkout require a CRM contact.
   * Returns the contact id when ready; otherwise starts phone/onboarding and returns null.
   */
  private async ensureCrmProfile(
    parsed: ParsedInbound,
    conversationId: string,
    contactId: string | null,
    leadId: string | null,
  ): Promise<string | null> {
    const resolved = await this.resolveContactId(contactId, leadId);
    if (resolved) {
      await this.linkTelegramToContact(parsed.userId, parsed.chatId, resolved);
      if (await this.startContactGapFillIfNeeded(parsed, conversationId, resolved)) {
        return null;
      }
      return resolved;
    }

    const session = await this.sessions.get(parsed.userId);
    if (isOnboardingState(session.state)) {
      await this.replyMenu(parsed.chatId, conversationId, TELEGRAM_PROFILE_REQUIRED);
      await this.repromptOnboarding(parsed, conversationId, session.state, session.payload);
      return null;
    }

    const phone = await this.resolveKnownPhone(parsed.userId, contactId, leadId);
    if (phone) {
      await this.replyMenu(parsed.chatId, conversationId, TELEGRAM_PROFILE_REQUIRED);
      await this.startOnboarding(parsed, conversationId, session.payload);
      return null;
    }

    await this.telegram.sendMessageToChat(parsed.chatId, TELEGRAM_REQUEST_PHONE, {
      requestContactButton: true,
    });
    return null;
  }

  private async startContactGapFillIfNeeded(
    parsed: ParsedInbound,
    conversationId: string,
    contactId: string,
  ): Promise<boolean> {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: {
        firstName: true,
        lastName: true,
        region: true,
        clientType: true,
      },
    });
    if (!contact) return false;
    const missingRole = !String(contact.clientType ?? "").trim();
    const missingRegion = !String(contact.region ?? "").trim();
    if (!missingRole && !missingRegion) return false;

    const firstName = String(contact.firstName ?? "").trim() || parsed.firstName || "Клієнт";
    const lastName = String(contact.lastName ?? "").trim() || parsed.lastName || "Telegram";
    const draft = withOnboardingFields({}, {
      onboardingContactId: contactId,
      onboardingFirstName: firstName,
      onboardingLastName: lastName,
      ...(missingRole ? {} : { onboardingClientType: String(contact.clientType).trim() }),
    });

    if (missingRole) {
      await this.sessions.set(parsed.userId, "onboarding_role", draft);
      await this.replyMenu(
        parsed.chatId,
        conversationId,
        "У профілі не вистачає даних. Оберіть, ви лікар чи технік:",
      );
      await this.askOnboardingRole(parsed, conversationId);
      return true;
    }

    await this.sessions.set(parsed.userId, "onboarding_region", draft);
    await this.replyMenu(
      parsed.chatId,
      conversationId,
      "У профілі немає області — оберіть її, щоб закріпити менеджера:",
    );
    await this.askOnboardingRegion(parsed, conversationId);
    return true;
  }

  private async linkTelegramToContact(
    telegramUserId: string,
    telegramChatId: string,
    contactId: string,
  ): Promise<void> {
    await this.prisma.telegramAccount.updateMany({
      where: { telegramUserId },
      data: { contactId, leadId: null },
    });
    await this.prisma.conversation.updateMany({
      where: { telegramChatId },
      data: { contactId, leadId: null },
    });
  }

  private async startOnboarding(
    parsed: ParsedInbound,
    conversationId: string,
    preservePayload: BotSessionPayload = {},
  ): Promise<void> {
    await this.sessions.set(parsed.userId, "onboarding_name", pickCheckoutDraft(preservePayload));
    await this.replyMenu(
      parsed.chatId,
      conversationId,
      `${TELEGRAM_ONBOARDING_INTRO}\n\n${TELEGRAM_ONBOARDING_ASK_NAME}`,
    );
  }

  private async askOnboardingRole(parsed: ParsedInbound, conversationId: string): Promise<void> {
    await this.replyInline(parsed.chatId, conversationId, TELEGRAM_ONBOARDING_ASK_ROLE, [
      [
        { text: "Лікар", callback_data: "onb:role:doctor" },
        { text: "Технік", callback_data: "onb:role:tech" },
      ],
    ]);
  }

  private async askOnboardingRegion(parsed: ParsedInbound, conversationId: string): Promise<void> {
    const regionRows: InlineBtn[][] = [];
    for (let i = 0; i < UKRAINE_REGIONS.length; i += 2) {
      const row: InlineBtn[] = [
        { text: UKRAINE_REGIONS[i]!, callback_data: `onb:reg:${i}` },
      ];
      if (UKRAINE_REGIONS[i + 1]) {
        row.push({ text: UKRAINE_REGIONS[i + 1]!, callback_data: `onb:reg:${i + 1}` });
      }
      regionRows.push(row);
    }
    await this.replyInline(parsed.chatId, conversationId, TELEGRAM_ONBOARDING_ASK_REGION, regionRows);
  }

  private async repromptOnboarding(
    parsed: ParsedInbound,
    conversationId: string,
    state: string,
    payload: BotSessionPayload,
  ): Promise<void> {
    if (state === "onboarding_name") {
      await this.replyMenu(parsed.chatId, conversationId, TELEGRAM_ONBOARDING_ASK_NAME);
      return;
    }
    if (state === "onboarding_role") {
      await this.askOnboardingRole(parsed, conversationId);
      return;
    }
    if (state === "onboarding_region") {
      void payload;
      await this.askOnboardingRegion(parsed, conversationId);
    }
  }

  private async handleOnboardingCallback(
    parsed: ParsedInbound,
    conversationId: string,
    action: string,
    rest: string[],
  ): Promise<void> {
    const session = await this.sessions.get(parsed.userId);
    // Stale inline buttons must not hijack checkout / catalog sessions.
    if (!isOnboardingState(session.state)) {
      return;
    }

    if (action === "role" && rest[0]) {
      const clientType =
        rest[0] === "doctor"
          ? TELEGRAM_CLIENT_TYPE_DOCTOR
          : rest[0] === "tech"
            ? TELEGRAM_CLIENT_TYPE_TECH
            : null;
      if (!clientType) {
        await this.askOnboardingRole(parsed, conversationId);
        return;
      }
      const firstName = session.payload.onboardingFirstName;
      const lastName = session.payload.onboardingLastName;
      if (!firstName || !lastName) {
        await this.sessions.set(
          parsed.userId,
          "onboarding_name",
          withOnboardingFields(session.payload, {
            onboardingContactId: session.payload.onboardingContactId,
          }),
        );
        await this.replyMenu(parsed.chatId, conversationId, TELEGRAM_ONBOARDING_ASK_NAME);
        return;
      }
      await this.sessions.set(
        parsed.userId,
        "onboarding_region",
        withOnboardingFields(session.payload, {
          onboardingFirstName: firstName,
          onboardingLastName: lastName,
          onboardingClientType: clientType,
          onboardingContactId: session.payload.onboardingContactId,
        }),
      );
      await this.askOnboardingRegion(parsed, conversationId);
      return;
    }

    if (action === "reg" && rest[0] != null) {
      const idx = Number(rest[0]);
      const region = UKRAINE_REGIONS[idx];
      if (!region) {
        await this.askOnboardingRegion(parsed, conversationId);
        return;
      }
      const firstName = session.payload.onboardingFirstName;
      const lastName = session.payload.onboardingLastName;
      const clientType = session.payload.onboardingClientType;
      if (!firstName || !lastName) {
        await this.sessions.set(
          parsed.userId,
          "onboarding_name",
          withOnboardingFields(session.payload, {
            onboardingClientType: clientType,
            onboardingContactId: session.payload.onboardingContactId,
          }),
        );
        await this.replyMenu(parsed.chatId, conversationId, TELEGRAM_ONBOARDING_ASK_NAME);
        return;
      }
      if (!clientType) {
        await this.sessions.set(
          parsed.userId,
          "onboarding_role",
          withOnboardingFields(session.payload, {
            onboardingFirstName: firstName,
            onboardingLastName: lastName,
            onboardingContactId: session.payload.onboardingContactId,
          }),
        );
        await this.askOnboardingRole(parsed, conversationId);
        return;
      }
      await this.finishOnboarding(parsed, conversationId, {
        firstName,
        lastName,
        clientType,
        region,
        contactId: session.payload.onboardingContactId,
        checkoutDraft: pickCheckoutDraft(session.payload),
      });
    }
  }

  private async finishOnboarding(
    parsed: ParsedInbound,
    conversationId: string,
    profile: {
      firstName: string;
      lastName: string;
      clientType: string;
      region: string;
      contactId?: string;
      checkoutDraft?: BotSessionPayload;
    },
  ): Promise<void> {
    const account = await this.prisma.telegramAccount.findUnique({
      where: { telegramUserId: parsed.userId },
      select: { leadId: true, contactId: true, phone: true },
    });

    const phone = await this.resolveKnownPhone(
      parsed.userId,
      profile.contactId ?? account?.contactId ?? null,
      account?.leadId ?? null,
    );
    if (!phone && !profile.contactId) {
      await this.sessions.resetIdle(parsed.userId);
      await this.telegram.sendMessageToChat(
        parsed.chatId,
        "Спочатку поділіться номером телефону кнопкою нижче.",
        { requestContactButton: true },
      );
      return;
    }

    let ownerId: string | null = null;
    try {
      const org = await this.settings.getOrgChartStructure();
      ownerId = resolveAssignedManagerForRegion(org, profile.region)?.managerId ?? null;
    } catch (err) {
      this.logger.warn(
        `onboarding org-chart: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    let companyId: string | null = null;
    let leadContactId: string | null = null;
    if (account?.leadId) {
      const lead = await this.prisma.lead.findUnique({
        where: { id: account.leadId },
        select: { companyId: true, contactId: true },
      });
      companyId = lead?.companyId ?? null;
      leadContactId = lead?.contactId ?? null;
    }

    let contactId: string | null =
      profile.contactId ?? account?.contactId ?? leadContactId ?? null;

    const profileData = {
      firstName: profile.firstName,
      lastName: profile.lastName,
      region: profile.region,
      clientType: profile.clientType,
      ...(ownerId ? { ownerId } : {}),
    };

    if (contactId) {
      try {
        await this.contacts.update(contactId, {
          ...profileData,
          ...(phone ? { phone } : {}),
        });
      } catch (updateErr) {
        this.logger.warn(
          `onboarding contact update: ${updateErr instanceof Error ? updateErr.message : String(updateErr)}`,
        );
      }
    } else {
      try {
        const created = await this.contacts.create({
          companyId,
          phone: phone!,
          ...profileData,
        });
        contactId = created.id;
      } catch (err) {
        if (err instanceof ConflictException) {
          const digits = phone ? getPhoneNormalizedDigits(phone) : null;
          const existing = digits ? await this.contacts.findContactByPhone(digits) : null;
          if (existing?.id) {
            contactId = existing.id;
            try {
              await this.contacts.update(existing.id, profileData);
            } catch (updateErr) {
              this.logger.warn(
                `onboarding contact update: ${updateErr instanceof Error ? updateErr.message : String(updateErr)}`,
              );
            }
          }
        }
        if (!contactId) {
          this.logger.warn(
            `finishOnboarding create failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          await this.replyMenu(
            parsed.chatId,
            conversationId,
            "Не вдалося зберегти профіль. Спробуйте ще раз або напишіть менеджеру.",
          );
          return;
        }
      }
    }

    await this.prisma.telegramAccount.updateMany({
      where: { telegramUserId: parsed.userId },
      data: {
        contactId,
        leadId: null,
        ...(phone ? { phone } : {}),
        firstName: profile.firstName,
        lastName: profile.lastName,
      },
    });
    await this.prisma.conversation.updateMany({
      where: { telegramChatId: parsed.chatId },
      data: { contactId, leadId: null },
    });

    if (account?.leadId) {
      await this.prisma.lead
        .update({
          where: { id: account.leadId },
          data: {
            contactId,
            region: profile.region,
            firstName: profile.firstName,
            lastName: profile.lastName,
            fullName: `${profile.lastName} ${profile.firstName}`.trim(),
            name: `${profile.lastName} ${profile.firstName}`.trim(),
            ...(ownerId ? { ownerId } : {}),
          },
        })
        .catch(() => {});
    }

    const draft = {
      ...pickCheckoutDraft(profile.checkoutDraft ?? {}),
      region: profile.checkoutDraft?.region ?? profile.region,
    };
    const hasCheckoutDraft = Boolean(draft.deliveryMethod || draft.paymentType || draft.cod);
    await this.sessions.set(parsed.userId, "idle", hasCheckoutDraft ? draft : {});

    let doneText = ownerId ? TELEGRAM_ONBOARDING_DONE : TELEGRAM_ONBOARDING_DONE_NO_MANAGER;
    if (hasCheckoutDraft) {
      doneText += "\n\nЧернетку оформлення збережено — відкрийте кошик і натисніть «Оформити».";
    }
    await this.replyMenu(parsed.chatId, conversationId, doneText);
  }

  /** Linked contact/lead, or a phone already stored on the Telegram account. */
  private async identityKnown(
    telegramUserId: string,
    contactId: string | null,
    leadId: string | null,
  ): Promise<boolean> {
    if (contactId || leadId) return true;
    const account = await this.prisma.telegramAccount.findUnique({
      where: { telegramUserId },
      select: { phone: true, contactId: true, leadId: true },
    });
    if (!account) return false;
    if (account.contactId || account.leadId) return true;
    return usablePhone(account.phone) != null;
  }

  private async replyWhenNoContact(
    parsed: ParsedInbound,
    conversationId: string,
    contactId: string | null,
    leadId: string | null,
    unknownText: string,
  ): Promise<void> {
    const resolved = await this.resolveContactId(contactId, leadId);
    if (resolved) {
      await this.replyMenu(
        parsed.chatId,
        conversationId,
        "У CRM поки немає ваших замовлень.",
      );
      return;
    }
    const phone = await this.resolveKnownPhone(parsed.userId, contactId, leadId);
    if (phone) {
      await this.replyMenu(parsed.chatId, conversationId, TELEGRAM_PROFILE_REQUIRED);
      await this.startOnboarding(parsed, conversationId);
      return;
    }
    await this.replyMenu(parsed.chatId, conversationId, unknownText);
  }

  /**
   * Phone for checkout: Telegram account, then the linked CRM contact, then the lead.
   * A known client must not be asked to share the number again.
   */
  private async resolveKnownPhone(
    telegramUserId: string,
    contactId: string | null,
    leadId: string | null,
  ): Promise<string | null> {
    const account = await this.prisma.telegramAccount.findUnique({
      where: { telegramUserId },
      select: { phone: true, contactId: true, leadId: true },
    });
    const own = usablePhone(account?.phone);
    if (own) return own;

    const cid = contactId || account?.contactId || null;
    const lid = leadId || account?.leadId || null;
    if (cid) {
      const contact = await this.prisma.contact.findUnique({
        where: { id: cid },
        select: { phone: true },
      });
      const fromContact = usablePhone(contact?.phone);
      if (fromContact) {
        await this.rememberPhone(telegramUserId, fromContact);
        return fromContact;
      }
    }
    if (lid) {
      const lead = await this.prisma.lead.findUnique({
        where: { id: lid },
        select: { phone: true, contactId: true },
      });
      if (lead?.contactId && lead.contactId !== cid) {
        const contact = await this.prisma.contact.findUnique({
          where: { id: lead.contactId },
          select: { phone: true },
        });
        const fromContact = usablePhone(contact?.phone);
        if (fromContact) {
          await this.rememberPhone(telegramUserId, fromContact);
          return fromContact;
        }
      }
      const fromLead = usablePhone(lead?.phone);
      if (fromLead) {
        await this.rememberPhone(telegramUserId, fromLead);
        return fromLead;
      }
    }
    return null;
  }

  private async rememberPhone(telegramUserId: string, phone: string): Promise<void> {
    await this.prisma.telegramAccount.updateMany({
      where: { telegramUserId },
      data: { phone },
    });
  }

  private async startCheckout(
    parsed: ParsedInbound,
    conversationId: string,
    contactId: string | null,
    leadId: string | null = null,
  ): Promise<void> {
    const cart = await this.cart.getCart({ sessionId: cartSessionId(parsed.userId) });
    if (!cart.items.length) {
      await this.replyMenu(parsed.chatId, conversationId, "Кошик порожній.");
      return;
    }
    const phone = await this.resolveKnownPhone(parsed.userId, contactId, leadId);
    if (!phone) {
      await this.sessions.set(parsed.userId, "checkout_phone", {});
      await this.telegram.sendMessageToChat(
        parsed.chatId,
        "Для оформлення поділіться номером телефону:",
        { requestContactButton: true },
      );
      return;
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
      "Оберіть область доставки:",
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

    if (action === "city" && rest[0]) {
      const ref = rest.join(":");
      const hit = payload.cityHits?.find((item) => item.ref === ref);
      if (!hit) {
        await this.replyMenu(
          parsed.chatId,
          conversationId,
          "Цей список міст уже недійсний. Напишіть назву міста ще раз.",
        );
        return;
      }
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

    if (action === "wh" && rest[0]) {
      const ref = rest.join(":");
      const hit = payload.warehouseHits?.find((item) => item.ref === ref);
      if (!hit) {
        await this.replyMenu(
          parsed.chatId,
          conversationId,
          "Цей список відділень уже недійсний. Напишіть номер або назву ще раз.",
        );
        return;
      }
      payload = await this.sessions.patchPayload(parsed.userId, "checkout_comment", {
        ...payload,
        warehouseRef: hit.ref,
        warehouseName: hit.name,
      });
      await this.askComment(parsed, conversationId, payload);
      return;
    }

    if (action === "st" && rest[0]) {
      const ref = rest.join(":");
      const hit = payload.streetHits?.find((item) => item.ref === ref);
      if (!hit) {
        await this.replyMenu(
          parsed.chatId,
          conversationId,
          "Цей список вулиць уже недійсний. Напишіть назву вулиці ще раз.",
        );
        return;
      }
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
          paymentType: "",
          cod: true,
        });
      } else if (method === "pre") {
        payload = await this.sessions.patchPayload(parsed.userId, "idle", {
          ...payload,
          paymentMethod: PaymentMethod.FOP,
          paymentType: PaymentType.PREPAYMENT,
          cod: false,
        });
      } else {
        return;
      }
      // Address complete (pickup / saved profile / warehouse or street collected) → comment.
      if (this.isCheckoutAddressReady(payload)) {
        await this.askComment(parsed, conversationId, payload);
        return;
      }
      await this.continueCheckoutAddress(parsed, conversationId, payload, contactId);
      return;
    }

    if (action === "go") {
      if (!this.isCheckoutAddressReady(payload) || !payload.region || (!payload.paymentType && !payload.cod)) {
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
    contactId: string | null,
  ): Promise<void> {
    if (payload.deliveryMethod !== "NOVA_POSHTA") {
      await this.startCheckout(parsed, conversationId, contactId);
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
    if (!_payload.paymentType && !_payload.cod) {
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
        hits
          .map((h) => npChoiceButton("city", h))
          .filter((btn): btn is InlineBtn => btn != null)
          .map((btn) => [btn]),
      );
    } catch (err) {
      this.logger.warn(`searchCities failed: ${err instanceof Error ? err.message : String(err)}`);
      await this.replyMenu(
        parsed.chatId,
        conversationId,
        `Пошук міста тимчасово недоступний. Спробуйте ще раз або напишіть менеджеру.`,
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
        hits
          .map((h) => npChoiceButton("wh", h))
          .filter((btn): btn is InlineBtn => btn != null)
          .map((btn) => [btn]),
      );
    } catch (err) {
      this.logger.warn(
        `searchWarehouses failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      await this.replyMenu(
        parsed.chatId,
        conversationId,
        `Пошук відділень тимчасово недоступний. Спробуйте інший запит або напишіть менеджеру.`,
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
        hits
          .map((h) => npChoiceButton("st", h))
          .filter((btn): btn is InlineBtn => btn != null)
          .map((btn) => [btn]),
      );
    } catch (err) {
      this.logger.warn(`searchStreets failed: ${err instanceof Error ? err.message : String(err)}`);
      await this.replyMenu(
        parsed.chatId,
        conversationId,
        `Пошук вулиць тимчасово недоступний. Спробуйте ще або напишіть менеджеру.`,
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
    const phone = await this.resolveKnownPhone(
      parsed.userId,
      contactId || account?.contactId || null,
      account?.leadId ?? null,
    );
    if (!phone) {
      await this.sessions.set(parsed.userId, "checkout_phone", payload);
      await this.telegram.sendMessageToChat(
        parsed.chatId,
        "Для оформлення потрібен номер телефону. Чернетку збережено — після номера замовлення створиться саме.",
        { requestContactButton: true },
      );
      return;
    }
    if (!payload.region) {
      await this.startCheckout(parsed, conversationId, contactId);
      return;
    }

    const crmContactId = contactId || account?.contactId || null;
    let firstName = account?.firstName || parsed.firstName || "Клієнт";
    let lastName = account?.lastName || parsed.lastName || "Telegram";
    if (crmContactId) {
      const contact = await this.prisma.contact.findUnique({
        where: { id: crmContactId },
        select: { firstName: true, lastName: true },
      });
      if (contact?.firstName?.trim()) firstName = contact.firstName.trim();
      if (contact?.lastName?.trim()) lastName = contact.lastName.trim();
    }

    const dto: StoreCheckoutDto = {
      phone,
      firstName,
      lastName,
      region: payload.region,
      deliveryMethod:
        payload.deliveryMethod === "PICKUP" ? DeliveryMethod.PICKUP : DeliveryMethod.NOVA_POSHTA,
      paymentMethod: payload.cod
        ? PaymentMethod.CASH
        : (payload.paymentMethod as PaymentMethod) || PaymentMethod.FOP,
      paymentType: payload.cod
        ? undefined
        : (payload.paymentType as PaymentType) || PaymentType.PREPAYMENT,
      comment: payload.cod
        ? ["Накладений платіж", payload.comment].filter(Boolean).join(". ")
        : payload.comment,
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
      const wantsPayLink = !payload.cod && payload.paymentType !== PaymentType.DEFERRED &&
        (!payload.paymentType || payload.paymentType === PaymentType.PREPAYMENT);
      if (payload.cod) {
        text += "\n\nОплата: накладений платіж при отриманні.";
      } else if (payUrl && wantsPayLink) {
        text += `\n\nОплата:\n${payUrl}`;
      } else if (!payUrl && wantsPayLink) {
        text += "\n\nМенеджер надішле реквізити для оплати.";
      }
      text += "\n\nСтатус можна дивитись у «Замовлення».";
      await this.replyMenu(parsed.chatId, conversationId, text);
    } catch (err) {
      this.logger.warn(
        `finishCheckout failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      const msg = clientSafeCheckoutError(err);
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

  private async clientMenuKeyboard() {
    const storeUrl = await this.resolveStoreMiniAppUrl();
    return storeUrl ? buildClientMenuKeyboard(storeUrl) : CLIENT_MENU_KEYBOARD;
  }

  private async replyMenu(chatId: string, conversationId: string, text: string): Promise<void> {
    await this.replyKeyboard(chatId, conversationId, text, await this.clientMenuKeyboard());
  }

  private async replyKeyboard(
    chatId: string,
    conversationId: string,
    text: string,
    keyboard: Array<Array<string | { text: string; webAppUrl?: string }>>,
  ): Promise<void> {
    const { messageId } = await this.telegram.sendMessageToChat(chatId, text, {
      menuKeyboard: keyboard,
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
      menuKeyboard: await this.clientMenuKeyboard(),
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
