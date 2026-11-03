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
  UserRole,
} from "@prisma/client";
import { signJwt } from "../../auth/jwt";
import {
  getPhoneCandidatesForLookup,
  getPhoneNormalizedDigits,
} from "../../common/phone.utils";
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
  CLIENT_FLOW_KEYBOARD,
  CLIENT_MENU_KEYBOARD,
  CLIENT_START_KEYBOARD,
  buildClientMenuKeyboard,
  MENU_CART,
  MENU_CATALOG,
  MENU_CLIENT_CANCEL,
  MENU_MANAGER,
  MENU_ORDERS,
  MENU_START,
  ORDERS_PAGE_SIZE,
  TELEGRAM_CANCELLED,
  TELEGRAM_CHECKOUT_IN_PROGRESS,
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
  TELEGRAM_PRESS_START,
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

function isCheckoutState(state: string): boolean {
  return (
    state === "checkout_flow" ||
    state === "checkout_city" ||
    state === "checkout_warehouse_q" ||
    state === "checkout_street" ||
    state === "checkout_building" ||
    state === "checkout_flat" ||
    state === "checkout_comment" ||
    state === "checkout_phone"
  );
}

/** Inline footer: Cancel always; Back when the wizard has a previous step. */
function withCheckoutNav(rows: InlineBtn[][], opts?: { back?: boolean }): InlineBtn[][] {
  const nav: InlineBtn[] = [];
  if (opts?.back) {
    nav.push({ text: "« Назад", callback_data: "chk:back" });
  }
  nav.push({ text: MENU_CLIENT_CANCEL, callback_data: "chk:abort" });
  return [...rows, nav];
}

function withOnboardingNav(rows: InlineBtn[][], opts?: { back?: boolean }): InlineBtn[][] {
  const nav: InlineBtn[] = [];
  if (opts?.back) {
    nav.push({ text: "« Назад", callback_data: "onb:back" });
  }
  nav.push({ text: MENU_CLIENT_CANCEL, callback_data: "onb:abort" });
  return [...rows, nav];
}

function isSlashCommand(text: string, name: string): boolean {
  const lower = text.trim().toLowerCase();
  const base = `/${name}`;
  return (
    lower === base ||
    lower.startsWith(`${base}@`) ||
    lower.startsWith(`${base} `)
  );
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
    if (text === MENU_CLIENT_CANCEL || isSlashCommand(text, "cancel")) {
      const wasOnboarding = inOnboarding;
      const wasCatalogSearch = earlySession.state === "catalog_search";
      const known = await this.identityKnown(parsed.userId, contactId, leadId);
      if (wasCatalogSearch) {
        await this.restoreCatalogPlace(parsed, conversationId, earlySession.payload);
      } else if (wasOnboarding) {
        await this.sessions.resetIdle(parsed.userId);
        await this.replyStartOnly(parsed.chatId, conversationId, TELEGRAM_ONBOARDING_PAUSED);
      } else if (!known) {
        await this.sessions.resetIdle(parsed.userId);
        await this.replyStartOnly(parsed.chatId, conversationId, TELEGRAM_PRESS_START);
      } else {
        await this.sessions.resetIdle(parsed.userId);
        await this.replyMenu(parsed.chatId, conversationId, TELEGRAM_CANCELLED);
      }
      return { handled: true, notifyManager: false };
    }

    // /menu during onboarding must not wipe name/role/region progress.
    if (isSlashCommand(text, "menu")) {
      if (inOnboarding) {
        await this.repromptOnboarding(
          parsed,
          conversationId,
          earlySession.state,
          earlySession.payload,
        );
        return { handled: true, notifyManager: false };
      }
      if (isCheckoutState(earlySession.state)) {
        await this.replyCheckoutNotice(parsed.chatId, conversationId);
        return { handled: true, notifyManager: false };
      }
      await this.sessions.resetIdle(parsed.userId);
      await this.replyMenu(parsed.chatId, conversationId, "Головне меню:");
      return { handled: true, notifyManager: false };
    }
    if (isSlashCommand(text, "help")) {
      if (isCheckoutState(earlySession.state)) {
        await this.replyCheckoutText(
          parsed.chatId,
          conversationId,
          "Оформлення триває. Напишіть дані цього кроку, «Назад» під повідомленням або «Скасувати».",
        );
      } else if (inOnboarding) {
        await this.replyOnboardingText(
          parsed.chatId,
          conversationId,
          "Спочатку завершіть профіль. «Назад» і «Скасувати» — під повідомленням.",
        );
      } else if (earlySession.state === "catalog_search") {
        await this.replyCheckoutText(
          parsed.chatId,
          conversationId,
          "Напишіть назву або артикул. «Скасувати» поверне до того місця каталогу, звідки ви шукали.",
        );
      } else {
        await this.replyMenu(parsed.chatId, conversationId, TELEGRAM_HELP);
      }
      return { handled: true, notifyManager: false };
    }
    if (text === MENU_START || isSlashCommand(text, "start")) {
      await this.replyStart(parsed, conversationId, contactId, leadId);
      return { handled: true, notifyManager: false };
    }

    // Contact share — acknowledge and show the menu. A checkout waiting for a phone resumes.
    if (parsed.phone) {
      const session = await this.sessions.get(parsed.userId);
      // Prefer CRM contact matched by this phone over any prior lead/link id.
      const resolvedContactId =
        (await this.findCrmContactIdByPhone(parsed.phone)) ??
        (await this.resolveContactId(contactId, leadId));
      if (session.state === "checkout_phone") {
        const draft = pickCheckoutDraft(session.payload);
        if (resolvedContactId) {
          await this.linkTelegramToContact(parsed.userId, parsed.chatId, resolvedContactId);
          if (this.canFinishCheckout(draft)) {
            await this.replyCheckoutText(
              parsed.chatId,
              conversationId,
              "Номер збережено. Оформлюємо замовлення.",
            );
            await this.finishCheckout(parsed, conversationId, resolvedContactId, draft);
          } else {
            await this.replyCheckoutText(
              parsed.chatId,
              conversationId,
              "Номер збережено. Продовжуємо оформлення.",
            );
            await this.resumeCheckoutFromDraft(parsed, conversationId, resolvedContactId, draft);
          }
        } else {
          // Keep checkout draft; collect CRM profile before finishing the order.
          await this.startOnboarding(parsed, conversationId, session.payload);
        }
        return { handled: true, notifyManager: false };
      }
      if (resolvedContactId) {
        await this.linkTelegramToContact(parsed.userId, parsed.chatId, resolvedContactId);
        // Role/region only when that CRM contact is missing them.
        if (await this.startContactGapFillIfNeeded(parsed, conversationId, resolvedContactId)) {
          return { handled: true, notifyManager: false };
        }
        await this.sessions.resetIdle(parsed.userId);
        await this.replyMenu(parsed.chatId, conversationId, TELEGRAM_EXISTING_CLIENT);
        return { handled: true, notifyManager: false };
      }
      // No CRM contact for this phone — collect name, role and region for a new card.
      await this.startOnboarding(parsed, conversationId);
      return { handled: true, notifyManager: false };
    }

    // Incomplete CRM profile: keep the user in the onboarding wizard.
    if (inOnboarding) {
      if (parsed.isCallback && text.startsWith("onb:")) {
        await this.handleCallback(parsed, conversationId, contactId, leadId, text);
        return { handled: true, notifyManager: false };
      }
      const wantsCommerce =
        text === MENU_CATALOG ||
        text === MENU_CART ||
        text === MENU_ORDERS ||
        text === CATALOG_SEARCH_BUTTON ||
        isSlashCommand(text, "catalog") ||
        isSlashCommand(text, "cart") ||
        isSlashCommand(text, "orders");
      // Gap-fill for an existing CRM contact must not trap Каталог/Замовлення.
      // New-client onboarding (no contact yet) still blocks commerce until name/role/region done.
      const isGapFill = Boolean(earlySession.payload.onboardingContactId);
      if (isGapFill && wantsCommerce) {
        await this.sessions.resetIdle(parsed.userId);
        // Fall through to commerce handlers below.
      } else {
        const isMenuShortcut =
          wantsCommerce ||
          text === MENU_MANAGER ||
          text === CATALOG_SEARCH_BUTTON;
        // Reply-keyboard taps must not be stored as a person name.
        // (🏠 Старт is handled above like /start and resumes onboarding.)
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
    }

    // Reply-keyboard menu — never wipe an active checkout with Catalog/Cart taps.
    const wantsCommerceMenu =
      text === MENU_CATALOG ||
      text === MENU_CART ||
      text === MENU_ORDERS ||
      text === MENU_MANAGER ||
      isSlashCommand(text, "catalog") ||
      isSlashCommand(text, "cart") ||
      isSlashCommand(text, "orders");
    if (wantsCommerceMenu && isCheckoutState(earlySession.state)) {
      await this.replyCheckoutNotice(parsed.chatId, conversationId);
      return { handled: true, notifyManager: false };
    }

    // Reply-keyboard menu — commerce requires a CRM contact (profile gate).
    if (text === MENU_CATALOG || isSlashCommand(text, "catalog")) {
      if (!(await this.ensureCrmProfile(parsed, conversationId, contactId, leadId))) {
        return { handled: true, notifyManager: false };
      }
      await this.sessions.resetIdle(parsed.userId);
      await this.showCatalogHome(parsed, conversationId);
      return { handled: true, notifyManager: false };
    }
    if (text === MENU_CART || isSlashCommand(text, "cart")) {
      if (!(await this.ensureCrmProfile(parsed, conversationId, contactId, leadId))) {
        return { handled: true, notifyManager: false };
      }
      await this.sessions.resetIdle(parsed.userId);
      await this.showCart(parsed, conversationId);
      return { handled: true, notifyManager: false };
    }
    if (text === MENU_ORDERS || isSlashCommand(text, "orders")) {
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
        await this.beginCatalogSearch(parsed, conversationId);
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
      // Old catalog/cart/orders inline buttons must not wipe an active checkout draft.
      // cart:chk is the resume/start path; chk:* is the wizard itself.
      const blocksCheckout =
        isCheckoutState(earlySession.state) &&
        (text.startsWith("cat:") ||
          text.startsWith("ord:") ||
          (text.startsWith("cart:") && !text.startsWith("cart:chk")));
      if (blocksCheckout) {
        await this.replyCheckoutNotice(parsed.chatId, conversationId);
        return { handled: true, notifyManager: false };
      }
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

    // No CRM identity yet: beginning of dialog (Старт / phone) — do not ping managers.
    if (!(await this.identityKnown(parsed.userId, contactId, leadId))) {
      return { handled: true, notifyManager: false };
    }

    // Phone known but no CRM contact — resume name/role onboarding (not role gap-fill).
    const resolvedContact = await this.resolveContactId(contactId, leadId);
    if (!resolvedContact) {
      await this.startOnboarding(parsed, conversationId, earlySession.payload);
      return { handled: true, notifyManager: false };
    }

    if (isCheckoutState(earlySession.state)) {
      await this.replyCheckoutNotice(parsed.chatId, conversationId);
      return { handled: true, notifyManager: false };
    }

    // Staff shopping as a client: do not ping CRM inbox for catalog/idle chatter.
    if (earlySession.payload.staffShopMode) {
      return { handled: true, notifyManager: false };
    }

    // Free text in idle → manager (do not block on missing role/region).
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
        await this.beginCatalogSearch(parsed, conversationId);
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
      if (action === "inc" || action === "dec" || action === "rm") {
        await this.adjustCartItem(parsed, conversationId, action, rest.join(":"));
        return;
      }
      if (action === "clr") {
        await this.cart.clearCart(await this.syncChatCart(parsed.userId));
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
        await this.replyOnboardingText(
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
      await this.promptFlat(parsed, conversationId, next);
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
        const draft = pickCheckoutDraft(payload);
        if (this.canFinishCheckout(draft)) {
          await this.replyCheckoutText(
            parsed.chatId,
            conversationId,
            "Номер уже є в картці. Оформлюємо замовлення.",
          );
          await this.finishCheckout(parsed, conversationId, contactId, draft);
        } else {
          await this.replyCheckoutText(
            parsed.chatId,
            conversationId,
            "Номер уже є в картці. Продовжуємо оформлення.",
          );
          await this.resumeCheckoutFromDraft(parsed, conversationId, contactId, draft);
        }
        return;
      }
      await this.requestCheckoutPhone(
        parsed.chatId,
        conversationId,
        "Щоб продовжити оформлення, поділіться номером кнопкою нижче.",
      );
      return;
    }
    if (state === "checkout_flow") {
      await this.replyCheckoutNotice(parsed.chatId, conversationId);
      return;
    }
    if (state === "checkout_comment") {
      const comment = text === "-" ? undefined : text;
      const next = { ...payload, comment };
      await this.sessions.set(parsed.userId, "checkout_comment", next);
      const preview = comment ? `Коментар:\n${comment}` : "Без коментаря.";
      await this.replyCheckoutInline(
        parsed.chatId,
        conversationId,
        `${preview}\n\nНатисніть «Оформити», щоб створити замовлення.`,
        [[{ text: "Оформити замовлення", callback_data: "chk:go" }]],
      );
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

  private catalogPlace(payload: BotSessionPayload): BotSessionPayload {
    return {
      catalogPage: payload.catalogPage,
      catalogSearch: payload.catalogSearch,
      catalogGroup: payload.catalogGroup,
      catalogCategory: payload.catalogCategory,
      catalogSubcategory: payload.catalogSubcategory,
      catalogCategoryOnlySub: payload.catalogCategoryOnlySub,
      catalogBranches: payload.catalogBranches,
      catalogSubHits: payload.catalogSubHits,
    };
  }

  private async beginCatalogSearch(parsed: ParsedInbound, conversationId: string): Promise<void> {
    const session = await this.sessions.get(parsed.userId);
    await this.sessions.set(parsed.userId, "catalog_search", this.catalogPlace(session.payload));
    await this.replyCheckoutText(
      parsed.chatId,
      conversationId,
      "Напишіть назву або артикул товару для пошуку.\n\nСкасувати поверне до цього місця каталогу.",
    );
  }

  /** Leave search on the list, category, or system the user opened it from. */
  private async restoreCatalogPlace(
    parsed: ParsedInbound,
    conversationId: string,
    payload: BotSessionPayload,
  ): Promise<void> {
    if (
      payload.catalogPage ||
      payload.catalogSearch ||
      payload.catalogCategory ||
      payload.catalogSubcategory ||
      payload.catalogCategoryOnlySub
    ) {
      await this.showCatalog(
        parsed,
        conversationId,
        payload.catalogPage || 1,
        payload.catalogSearch,
        payload.catalogGroup,
        {
          category: payload.catalogCategory,
          subcategory: payload.catalogSubcategory,
          categoryOnlySub: payload.catalogCategoryOnlySub,
          subHits: payload.catalogSubHits,
          branches: payload.catalogBranches,
        },
      );
      return;
    }
    if (payload.catalogGroup && payload.catalogCategory && payload.catalogSubHits?.length) {
      await this.showCatalogSubcategories(parsed, conversationId, payload);
      return;
    }
    if (payload.catalogGroup) {
      await this.showCatalogGroup(parsed, conversationId, payload.catalogGroup);
      return;
    }
    await this.showCatalogHome(parsed, conversationId);
  }

  private async showCatalogHome(parsed: ParsedInbound, conversationId: string): Promise<void> {
    await this.sessions.resetIdle(parsed.userId);
    const storeUrl = await this.resolveStoreMiniAppUrl();
    if (storeUrl) {
      // One message: Telegram allows a single reply_markup (inline wins).
      await this.replyInline(
        parsed.chatId,
        conversationId,
        "Каталог відкривається в магазині Telegram.\n\nНатисніть кнопку нижче або «Каталог» у меню.",
        [
          [{ text: "🛍 Відкрити каталог", web_app: { url: storeUrl } }],
          [{ text: "🛒 Кошик у чаті", callback_data: "cart:show" }],
        ],
      );
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
    await this.replyInline(
      parsed.chatId,
      conversationId,
      "Каталог\n\nОберіть систему:",
      rows,
    );
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
    rows.push([
      { text: "« Системи", callback_data: "cat:home" },
      { text: CATALOG_SEARCH_BUTTON, callback_data: "cat:s" },
      { text: "🛒 Кошик", callback_data: "cart:show" },
    ]);
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
    const footer: InlineBtn[] = [];
    if (payload.catalogGroup) {
      footer.push({ text: "« Категорії", callback_data: `cat:g:${payload.catalogGroup}` });
    }
    footer.push({ text: CATALOG_SEARCH_BUTTON, callback_data: "cat:s" });
    footer.push({ text: "🛒 Кошик", callback_data: "cart:show" });
    rows.push(footer);
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
        [[...backRow, { text: CATALOG_SEARCH_BUTTON, callback_data: "cat:s" }, { text: "🛒 Кошик", callback_data: "cart:show" }]],
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
        [
          ...backRow,
          { text: CATALOG_SEARCH_BUTTON, callback_data: "cat:s" },
          { text: "🛒 Кошик", callback_data: "cart:show" },
        ],
      ],
    );
  }

  /** Return to the current catalog list page / branch (not hard-coded page 1). */
  private async catalogReturnCallback(userId: string): Promise<string> {
    const session = await this.sessions.get(userId);
    const page = session.payload.catalogPage;
    if (typeof page === "number" && page >= 1) return `cat:p:${page}`;
    if (session.payload.catalogSubHits?.length) return "cat:branch";
    if (session.payload.catalogGroup) return `cat:g:${session.payload.catalogGroup}`;
    return "cat:home";
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
    const backData = await this.catalogReturnCallback(parsed.userId);
    const buttons: InlineBtn[][] = [];
    if (p.stock > 0) {
      buttons.push([
        { text: "+1", callback_data: `cat:a:${p.id}:1` },
        { text: "+2", callback_data: `cat:a:${p.id}:2` },
        { text: "+5", callback_data: `cat:a:${p.id}:5` },
      ]);
    }
    buttons.push([
      { text: "⬅️ Каталог", callback_data: backData },
      { text: "🛒 Кошик", callback_data: "cart:show" },
    ]);

    if (p.primaryImageUrl) {
      try {
        const { messageId } = await this.telegram.sendPhotoToChat(parsed.chatId, p.primaryImageUrl, {
          caption,
          inlineKeyboard: buttons,
          menuKeyboard: await this.clientMenuKeyboard(),
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
      const cart = await this.cart.addItem(await this.syncChatCart(parsed.userId), productId, qty);
      const backData = await this.catalogReturnCallback(parsed.userId);
      await this.replyInline(
        parsed.chatId,
        conversationId,
        `Додано до кошика. Разом позицій: ${cart.items.length}, сума: ${Math.round(cart.subtotal * cart.uahPerUsd)} грн.`,
        [
          [{ text: "🛒 Кошик", callback_data: "cart:show" }],
          [{ text: "✅ Оформити", callback_data: "cart:chk" }],
          [{ text: "⬅️ Каталог", callback_data: backData }],
        ],
      );
    } catch (err) {
      const msg = err instanceof BadRequestException ? String(err.message) : "Не вдалося додати товар.";
      await this.replyMenu(parsed.chatId, conversationId, msg);
    }
  }

  // ─── Cart ────────────────────────────────────────────────────────────────

  /** Bot + Mini App share `tg:{userId}`. Fold a leftover customer cart into that session. */
  private async syncChatCart(userId: string): Promise<{ sessionId: string }> {
    const sessionId = cartSessionId(userId);
    try {
      const account = await this.prisma.telegramAccount.findUnique({
        where: { telegramUserId: userId },
        select: { contactId: true },
      });
      const contactId = account?.contactId;
      if (!contactId) return { sessionId };
      const customer = await this.prisma.customer.findUnique({
        where: { contactId },
        select: { id: true },
      });
      if (customer) await this.cart.unifyTelegramCart(customer.id, sessionId);
    } catch {
      /* session cart still works */
    }
    return { sessionId };
  }

  private async adjustCartItem(
    parsed: ParsedInbound,
    conversationId: string,
    action: string,
    itemId: string,
  ): Promise<void> {
    if (!itemId) {
      await this.showCart(parsed, conversationId);
      return;
    }
    const identity = await this.syncChatCart(parsed.userId);
    try {
      const cart = await this.cart.getCart(identity);
      const item = cart.items.find((row) => row.id === itemId);
      if (!item) {
        await this.showCart(parsed, conversationId);
        return;
      }
      if (action === "rm" || (action === "dec" && item.qty <= 1)) {
        await this.cart.removeItem(identity, itemId);
      } else if (action === "dec") {
        await this.cart.updateItemQty(identity, itemId, item.qty - 1);
      } else {
        await this.cart.updateItemQty(identity, itemId, item.qty + 1);
      }
    } catch (err) {
      const msg = err instanceof BadRequestException ? String(err.message) : "Не вдалося змінити кількість.";
      await this.replyMenu(parsed.chatId, conversationId, msg);
      return;
    }
    await this.showCart(parsed, conversationId);
  }

  private async showCart(parsed: ParsedInbound, conversationId: string): Promise<void> {
    const cart = await this.cart.getCart(await this.syncChatCart(parsed.userId));
    if (!cart.items.length) {
      await this.replyInline(parsed.chatId, conversationId, "Кошик порожній.", [
        [{ text: "🛍 Каталог", callback_data: "cat:home" }],
      ]);
      return;
    }
    const lines = cart.items.map(
      (i) => `• ${i.name} × ${i.qty} = ${Math.round(i.lineTotal * cart.uahPerUsd)} грн`,
    );
    const totalUah = Math.round(cart.subtotal * cart.uahPerUsd);
    const qtyRows: InlineBtn[][] = cart.items.map((item) => [
      { text: "−", callback_data: `cart:dec:${item.id}` },
      { text: `${item.name} · ${item.qty}`.slice(0, 40), callback_data: "cart:show" },
      { text: "+", callback_data: `cart:inc:${item.id}` },
      { text: "✕", callback_data: `cart:rm:${item.id}` },
    ]);
    await this.replyInline(
      parsed.chatId,
      conversationId,
      `Кошик:\n${lines.join("\n")}\n\nРазом: ${totalUah} грн`,
      [
        ...qtyRows,
        [{ text: "✅ Оформити", callback_data: "cart:chk" }],
        [{ text: "🗑 Очистити", callback_data: "cart:clr" }],
        [{ text: "🛍 Каталог", callback_data: "cat:home" }],
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

  /** CRM contact whose primary/extra phone matches the given number. */
  private async findCrmContactIdByPhone(phone: string | null | undefined): Promise<string | null> {
    const digits = getPhoneNormalizedDigits(phone ?? "");
    if (!digits) return null;
    for (const candidate of getPhoneCandidatesForLookup(digits)) {
      const row = await this.contacts.findContactByPhone(candidate);
      if (row?.id) return row.id;
    }
    return null;
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
    const commerceFooter: InlineBtn[] = [
      { text: "🛍 Каталог", callback_data: "cat:home" },
      { text: "🛒 Кошик", callback_data: "cart:show" },
    ];
    if (items.length === 0) {
      await this.replyInline(
        parsed.chatId,
        conversationId,
        "У CRM поки немає ваших замовлень.",
        [commerceFooter],
      );
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
      [...rows, ...(nav.length ? [nav] : []), commerceFooter],
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
    buttons.push([
      { text: "🛍 Каталог", callback_data: "cat:home" },
      { text: "🛒 Кошик", callback_data: "cart:show" },
    ]);
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
    await this.replyInline(parsed.chatId, conversationId, "Оплата замовлення:", [
      [{ text: "💳 Оплатити", url }],
    ]);
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
    const identity = await this.syncChatCart(parsed.userId);
    await this.cart.clearCart(identity);
    let added = 0;
    for (const item of order.items) {
      if (!item.productId) continue;
      try {
        await this.cart.addItem(identity, item.productId, item.qty);
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

    // Resume mid-onboarding without wiping collected name/role.
    if (isOnboardingState(session.state)) {
      await this.repromptOnboarding(parsed, conversationId, session.state, session.payload);
      return;
    }

    // /start during checkout must not wipe the draft (same idea as /menu).
    if (isCheckoutState(session.state)) {
      await this.replyCheckoutNotice(parsed.chatId, conversationId);
      return;
    }

    const phone = await this.resolveKnownPhone(parsed.userId, contactId, leadId);
    const resolvedContactId =
      (phone ? await this.findCrmContactIdByPhone(phone) : null) ??
      (await this.resolveContactId(contactId, leadId));

    if (resolvedContactId) {
      await this.linkTelegramToContact(parsed.userId, parsed.chatId, resolvedContactId);
      // Ask role/region only for empty fields on the CRM contact found by phone.
      if (await this.startContactGapFillIfNeeded(parsed, conversationId, resolvedContactId)) {
        return;
      }
      await this.sessions.resetIdle(parsed.userId);
      await this.replyMenu(parsed.chatId, conversationId, TELEGRAM_EXISTING_CLIENT);
      return;
    }

    if (phone) {
      // Phone known but no CRM contact yet — finish profile (name / role / region).
      await this.startOnboarding(parsed, conversationId);
      return;
    }

    await this.sessions.resetIdle(parsed.userId);
    await this.telegram.sendMessageToChat(parsed.chatId, TELEGRAM_WELCOME, {
      requestContactButton: true,
      menuKeyboard: CLIENT_FLOW_KEYBOARD,
    });
  }

  // ─── New-client onboarding ───────────────────────────────────────────────

  /**
   * Catalog / cart / orders require a CRM contact identity.
   * Role/region gap-fill is NOT gated here — that only runs on /start and phone share,
   * so «Замовлення» never loops on лікар/технік.
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
      return resolved;
    }

    const session = await this.sessions.get(parsed.userId);
    if (isOnboardingState(session.state)) {
      // One prompt: resume the current step (no extra PROFILE_REQUIRED ping).
      await this.repromptOnboarding(parsed, conversationId, session.state, session.payload);
      return null;
    }

    const phone = await this.resolveKnownPhone(parsed.userId, contactId, leadId);
    if (phone) {
      // startOnboarding already sends intro + ask name.
      await this.startOnboarding(parsed, conversationId, session.payload);
      return null;
    }

    await this.telegram.sendMessageToChat(parsed.chatId, TELEGRAM_REQUEST_PHONE, {
      requestContactButton: true,
      menuKeyboard: CLIENT_FLOW_KEYBOARD,
    });
    return null;
  }

  /**
   * CRM contact already exists (matched by phone). Ask only for fields that are
   * empty on that card — never re-ask role/region that CRM already has.
   */
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
      // Reply keyboard (Скасувати) before the first inline step.
      await this.replyOnboardingText(
        parsed.chatId,
        conversationId,
        "У профілі не вистачає даних. Скасувати — кнопка нижче.",
      );
      await this.askOnboardingRole(parsed, conversationId, { back: true });
      return true;
    }

    await this.sessions.set(parsed.userId, "onboarding_region", draft);
    await this.replyOnboardingText(
      parsed.chatId,
      conversationId,
      "У профілі немає області. Скасувати — кнопка нижче.",
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
    // Hide share-phone / commerce keyboard until the profile is complete.
    await this.replyOnboardingText(
      parsed.chatId,
      conversationId,
      `${TELEGRAM_ONBOARDING_INTRO}\n\n${TELEGRAM_ONBOARDING_ASK_NAME}`,
    );
  }

  private async askOnboardingRole(
    parsed: ParsedInbound,
    conversationId: string,
    opts?: { back?: boolean },
  ): Promise<void> {
    await this.replyOnboardingInline(
      parsed.chatId,
      conversationId,
      TELEGRAM_ONBOARDING_ASK_ROLE,
      withOnboardingNav(
        [
          [
            { text: "Лікар", callback_data: "onb:role:doctor" },
            { text: "Технік", callback_data: "onb:role:tech" },
          ],
        ],
        { back: opts?.back !== false },
      ),
    );
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
    await this.replyOnboardingInline(
      parsed.chatId,
      conversationId,
      TELEGRAM_ONBOARDING_ASK_REGION,
      withOnboardingNav(regionRows, { back: true }),
    );
  }

  private async repromptOnboarding(
    parsed: ParsedInbound,
    conversationId: string,
    state: string,
    payload: BotSessionPayload,
  ): Promise<void> {
    if (state === "onboarding_name") {
      await this.replyOnboardingText(parsed.chatId, conversationId, TELEGRAM_ONBOARDING_ASK_NAME);
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

    if (action === "abort") {
      await this.sessions.resetIdle(parsed.userId);
      await this.replyStartOnly(parsed.chatId, conversationId, TELEGRAM_ONBOARDING_PAUSED);
      return;
    }

    if (action === "back") {
      if (session.state === "onboarding_region") {
        await this.sessions.set(
          parsed.userId,
          "onboarding_role",
          withOnboardingFields(session.payload, {
            onboardingFirstName: session.payload.onboardingFirstName,
            onboardingLastName: session.payload.onboardingLastName,
            onboardingContactId: session.payload.onboardingContactId,
            onboardingClientType: undefined,
          }),
        );
        await this.askOnboardingRole(parsed, conversationId, {
          back: !session.payload.onboardingContactId,
        });
        return;
      }
      if (session.state === "onboarding_role") {
        if (session.payload.onboardingContactId) {
          // Gap-fill started at role — back = abort to Start.
          await this.sessions.resetIdle(parsed.userId);
          await this.replyStartOnly(parsed.chatId, conversationId, TELEGRAM_ONBOARDING_PAUSED);
          return;
        }
        await this.sessions.set(
          parsed.userId,
          "onboarding_name",
          withOnboardingFields(session.payload, {
            onboardingFirstName: undefined,
            onboardingLastName: undefined,
            onboardingClientType: undefined,
          }),
        );
        await this.replyOnboardingText(parsed.chatId, conversationId, TELEGRAM_ONBOARDING_ASK_NAME);
        return;
      }
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
        await this.replyOnboardingText(parsed.chatId, conversationId, TELEGRAM_ONBOARDING_ASK_NAME);
        return;
      }

      // Persist role immediately so Замовлення/Каталог never re-ask if region step is skipped.
      const gapContactId = session.payload.onboardingContactId;
      if (gapContactId) {
        try {
          await this.contacts.update(gapContactId, { clientType });
        } catch (err) {
          this.logger.warn(
            `gap-fill role save: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        const existing = await this.prisma.contact.findUnique({
          where: { id: gapContactId },
          select: { region: true },
        });
        const existingRegion = String(existing?.region ?? "").trim();
        if (existingRegion) {
          await this.finishOnboarding(parsed, conversationId, {
            firstName,
            lastName,
            clientType,
            region: existingRegion,
            contactId: gapContactId,
            checkoutDraft: pickCheckoutDraft(session.payload),
          });
          return;
        }
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
        await this.replyOnboardingText(parsed.chatId, conversationId, TELEGRAM_ONBOARDING_ASK_NAME);
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
      const resolved = resolveAssignedManagerForRegion(org, profile.region)?.managerId ?? null;
      if (resolved) {
        const active = await this.prisma.user.findFirst({
          where: {
            id: resolved,
            isActive: true,
            role: { in: [UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER] },
          },
          select: { id: true },
        });
        ownerId = active?.id ?? null;
      }
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
      data: {
        contactId,
        leadId: null,
        // Auto-assign inbox thread to the regional manager from org-chart.
        ...(ownerId ? { assignedToUserId: ownerId } : {}),
      },
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
    const hasCheckoutDraft = Boolean(
      draft.region ||
        draft.deliveryMethod ||
        draft.paymentType ||
        draft.cod ||
        draft.cityRef ||
        draft.warehouseRef ||
        draft.profileId,
    );
    let doneText = ownerId ? TELEGRAM_ONBOARDING_DONE : TELEGRAM_ONBOARDING_DONE_NO_MANAGER;
    if (hasCheckoutDraft) {
      const cart = await this.cart.getCart(await this.syncChatCart(parsed.userId));
      if (cart.items.length) {
        await this.replyCheckoutText(
          parsed.chatId,
          conversationId,
          `${doneText}\n\nПродовжуємо оформлення.`,
        );
        await this.resumeCheckoutFromDraft(parsed, conversationId, contactId, draft, {
          announce: false,
        });
        return;
      }
      doneText += "\n\nЧернетку збережено. Додайте товари в кошик і натисніть «Оформити».";
    }
    await this.sessions.set(parsed.userId, "idle", hasCheckoutDraft ? draft : {});
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
    const cart = await this.cart.getCart(await this.syncChatCart(parsed.userId));
    if (!cart.items.length) {
      await this.replyMenu(parsed.chatId, conversationId, "Кошик порожній.");
      return;
    }
    const prior = await this.sessions.get(parsed.userId);
    const draft = pickCheckoutDraft(prior.payload);
    const phone = await this.resolveKnownPhone(parsed.userId, contactId, leadId);
    if (!phone) {
      await this.sessions.set(parsed.userId, "checkout_phone", draft);
      await this.requestCheckoutPhone(
        parsed.chatId,
        conversationId,
        "Для оформлення поділіться номером телефону:",
      );
      return;
    }
    // Resume any draft saved across onboarding / phone share instead of wiping it.
    await this.resumeCheckoutFromDraft(parsed, conversationId, contactId, draft, { announce: true });
  }

  private buildRegionInlineRows(): InlineBtn[][] {
    const regionRows: InlineBtn[][] = [];
    for (let i = 0; i < UKRAINE_REGIONS.length; i += 2) {
      const row: InlineBtn[] = [
        { text: UKRAINE_REGIONS[i]!, callback_data: `chk:reg:${i}` },
      ];
      if (UKRAINE_REGIONS[i + 1]) {
        row.push({ text: UKRAINE_REGIONS[i + 1]!, callback_data: `chk:reg:${i + 1}` });
      }
      regionRows.push(row);
    }
    return regionRows;
  }

  private canFinishCheckout(payload: BotSessionPayload): boolean {
    return Boolean(
      payload.region &&
        this.isCheckoutAddressReady(payload) &&
        (payload.paymentType || payload.cod),
    );
  }

  /** Continue wizard from a preserved draft (post-onboarding / phone share / «Оформити»). */
  private async resumeCheckoutFromDraft(
    parsed: ParsedInbound,
    conversationId: string,
    contactId: string | null,
    payload: BotSessionPayload,
    opts?: { announce?: boolean },
  ): Promise<void> {
    const draft = pickCheckoutDraft(payload);
    await this.sessions.set(parsed.userId, "checkout_flow", draft);
    // Telegram keeps only one reply_markup. Set Cancel once when entering from the commerce menu.
    if (opts?.announce) {
      await this.replyCheckoutText(
        parsed.chatId,
        conversationId,
        "Оформлення. Скасувати — кнопка нижче або під кроками.",
      );
    }

    if (!draft.region) {
      await this.replyCheckoutInline(
        parsed.chatId,
        conversationId,
        "Оберіть область доставки:",
        this.buildRegionInlineRows(),
        { back: false },
      );
      return;
    }

    if (!draft.deliveryMethod) {
      await this.askDeliveryMethod(parsed, conversationId);
      return;
    }

    if (draft.deliveryMethod === "PICKUP") {
      if (!(draft.paymentType || draft.cod)) {
        await this.askPayment(parsed, conversationId);
        return;
      }
      await this.askComment(parsed, conversationId, draft);
      return;
    }

    if (!this.isCheckoutAddressReady(draft)) {
      await this.continueCheckoutAddress(parsed, conversationId, draft, contactId);
      return;
    }
    if (!(draft.paymentType || draft.cod)) {
      await this.askPayment(parsed, conversationId);
      return;
    }
    await this.askComment(parsed, conversationId, draft);
  }

  private async handleCheckoutCallback(
    parsed: ParsedInbound,
    conversationId: string,
    contactId: string | null,
    action: string,
    rest: string[],
  ): Promise<void> {
    const session = await this.sessions.get(parsed.userId);
    // Ignore stale inline buttons after cancel / leave checkout.
    if (!isCheckoutState(session.state)) return;
    let payload = { ...session.payload };

    if (action === "abort") {
      await this.sessions.resetIdle(parsed.userId);
      await this.replyMenu(parsed.chatId, conversationId, TELEGRAM_CANCELLED);
      return;
    }

    if (action === "back") {
      await this.handleCheckoutBack(parsed, conversationId, contactId, payload);
      return;
    }

    if (action === "reg" && rest[0] != null) {
      const idx = Number(rest[0]);
      const region = UKRAINE_REGIONS[idx];
      if (!region) return;
      try {
        const org = await this.settings.getOrgChartStructure();
        const hasManager =
          Boolean(resolveAssignedManagerForRegion(org, region)?.managerId) ||
          Boolean(process.env.STORE_OWNER_ID?.trim());
        if (!hasManager) {
          await this.replyCheckoutInline(
            parsed.chatId,
            conversationId,
            `Для області «${region}» ще немає менеджера в CRM. Оберіть іншу область або напишіть у «Менеджер».`,
            this.buildRegionInlineRows(),
            { back: false },
          );
          return;
        }
      } catch {
        // Org-chart unavailable — still let checkout proceed; store layer may reject later.
      }
      payload = await this.sessions.patchPayload(parsed.userId, "checkout_flow", { ...payload, region });
      await this.askDeliveryMethod(parsed, conversationId);
      return;
    }

    if (action === "del") {
      if (rest[0] === "pickup") {
        payload = await this.sessions.patchPayload(parsed.userId, "checkout_flow", {
          ...payload,
          deliveryMethod: "PICKUP",
        });
        await this.askPayment(parsed, conversationId);
        return;
      }
      if (rest[0] === "np") {
        payload = await this.sessions.patchPayload(parsed.userId, "checkout_flow", {
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
              await this.replyCheckoutInline(
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
      const draft = pickCheckoutDraft(payload);
      await this.sessions.set(parsed.userId, "idle", draft);
      await this.replyInline(
        parsed.chatId,
        conversationId,
        "Оформлення на компанію (ЄДРПОУ) робить менеджер. Напишіть реквізити в чат — передамо в CRM.\n\nЧернетку збережено.",
        [[{ text: "🛒 Кошик", callback_data: "cart:show" }]],
      );
      return;
    }

    if (action === "prof") {
      if (rest[0] === "new") {
        await this.askDeliveryType(parsed, conversationId);
        return;
      }
      if (rest[0]) {
        payload = await this.sessions.patchPayload(parsed.userId, "checkout_flow", {
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
      payload = {
        ...payload,
        deliveryType,
        deliveryMethod: "NOVA_POSHTA",
        profileId: undefined,
      };
      await this.promptCity(parsed, conversationId, payload);
      return;
    }

    if (action === "city" && rest[0]) {
      const ref = rest.join(":");
      const hit = payload.cityHits?.find((item) => item.ref === ref);
      if (!hit) {
        await this.replyCheckoutPrompt(
          parsed.chatId,
          conversationId,
          "Цей список міст уже недійсний. Напишіть назву міста ще раз.",
        );
        return;
      }
      payload = { ...payload, cityRef: hit.ref, cityName: hit.name };
      if (payload.deliveryType === "ADDRESS") {
        await this.promptStreet(parsed, conversationId, payload);
      } else {
        await this.promptWarehouse(parsed, conversationId, payload);
      }
      return;
    }

    if (action === "wh" && rest[0]) {
      const ref = rest.join(":");
      const hit = payload.warehouseHits?.find((item) => item.ref === ref);
      if (!hit) {
        await this.replyCheckoutPrompt(
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
        await this.replyCheckoutPrompt(
          parsed.chatId,
          conversationId,
          "Цей список вулиць уже недійсний. Напишіть назву вулиці ще раз.",
        );
        return;
      }
      payload = { ...payload, streetRef: hit.ref, streetName: hit.name };
      await this.promptBuilding(parsed, conversationId, payload);
      return;
    }

    if (action === "pay") {
      const method = rest[0];
      if (method === "cod") {
        payload = await this.sessions.patchPayload(parsed.userId, "checkout_flow", {
          ...payload,
          paymentMethod: PaymentMethod.CASH,
          paymentType: "",
          cod: true,
        });
      } else if (method === "pre") {
        payload = await this.sessions.patchPayload(parsed.userId, "checkout_flow", {
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

    if (action === "skipc") {
      const next = { ...payload, comment: undefined };
      await this.sessions.set(parsed.userId, "checkout_comment", next);
      await this.replyCheckoutInline(
        parsed.chatId,
        conversationId,
        "Без коментаря.\n\nНатисніть «Оформити», щоб створити замовлення.",
        [[{ text: "Оформити замовлення", callback_data: "chk:go" }]],
      );
      return;
    }

    if (action === "go") {
      if (!this.canFinishCheckout(payload)) {
        await this.replyCheckoutText(
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
      await this.promptCity(parsed, conversationId, payload);
      return;
    }
    if (payload.deliveryType === "ADDRESS") {
      if (!payload.streetRef) {
        await this.promptStreet(parsed, conversationId, payload);
        return;
      }
      if (!payload.building) {
        await this.promptBuilding(parsed, conversationId, payload);
        return;
      }
      await this.promptFlat(parsed, conversationId, payload);
      return;
    }
    await this.promptWarehouse(parsed, conversationId, payload);
  }

  private async askDeliveryMethod(parsed: ParsedInbound, conversationId: string): Promise<void> {
    await this.replyCheckoutInline(parsed.chatId, conversationId, "Спосіб доставки:", [
      [{ text: "🏪 Самовивіз", callback_data: "chk:del:pickup" }],
      [{ text: "📦 Нова Пошта", callback_data: "chk:del:np" }],
    ]);
  }

  private async askDeliveryType(parsed: ParsedInbound, conversationId: string): Promise<void> {
    await this.replyCheckoutInline(parsed.chatId, conversationId, "Тип доставки Новою Поштою:", [
      [{ text: "Відділення", callback_data: "chk:dtype:wh" }],
      [{ text: "Поштомат", callback_data: "chk:dtype:pm" }],
      [{ text: "Адреса", callback_data: "chk:dtype:addr" }],
      [{ text: "🏢 На компанію (менеджер)", callback_data: "chk:company" }],
    ]);
  }

  private async askPayment(parsed: ParsedInbound, conversationId: string): Promise<void> {
    await this.replyCheckoutInline(parsed.chatId, conversationId, "Оплата:", [
      [{ text: "💳 Передоплата", callback_data: "chk:pay:pre" }],
      [{ text: "📦 Накладений платіж", callback_data: "chk:pay:cod" }],
    ]);
  }

  /** Text step: inline Back + Cancel, so a hidden reply keyboard is not a dead end. */
  private async replyCheckoutPrompt(
    chatId: string,
    conversationId: string,
    text: string,
  ): Promise<void> {
    await this.replyCheckoutInline(chatId, conversationId, text, []);
  }

  private async promptCity(
    parsed: ParsedInbound,
    conversationId: string,
    draft: BotSessionPayload,
  ): Promise<void> {
    await this.sessions.set(parsed.userId, "checkout_city", draft);
    await this.replyCheckoutPrompt(
      parsed.chatId,
      conversationId,
      "Напишіть назву міста (як у Новій Пошті):",
    );
  }

  private async promptWarehouse(
    parsed: ParsedInbound,
    conversationId: string,
    draft: BotSessionPayload,
  ): Promise<void> {
    await this.sessions.set(parsed.userId, "checkout_warehouse_q", draft);
    await this.replyCheckoutPrompt(
      parsed.chatId,
      conversationId,
      draft.deliveryType === "POSTOMAT"
        ? "Напишіть номер або назву поштомату (або «-» щоб показати список):"
        : "Напишіть номер/назву відділення (або «-» щоб показати список):",
    );
  }

  private async promptStreet(
    parsed: ParsedInbound,
    conversationId: string,
    draft: BotSessionPayload,
  ): Promise<void> {
    await this.sessions.set(parsed.userId, "checkout_street", draft);
    await this.replyCheckoutPrompt(parsed.chatId, conversationId, "Напишіть назву вулиці:");
  }

  private async promptBuilding(
    parsed: ParsedInbound,
    conversationId: string,
    draft: BotSessionPayload,
  ): Promise<void> {
    await this.sessions.set(parsed.userId, "checkout_building", draft);
    await this.replyCheckoutPrompt(parsed.chatId, conversationId, "Номер будинку:");
  }

  private async promptFlat(
    parsed: ParsedInbound,
    conversationId: string,
    draft: BotSessionPayload,
  ): Promise<void> {
    await this.sessions.set(parsed.userId, "checkout_flat", draft);
    await this.replyCheckoutPrompt(
      parsed.chatId,
      conversationId,
      "Квартира / офіс (або «-» якщо немає):",
    );
  }

  /** Delivery picker. Method and any NP address are cleared so Back cannot mix pickup with an old warehouse. */
  private async showDeliveryMethodStep(
    parsed: ParsedInbound,
    conversationId: string,
    draft: BotSessionPayload,
  ): Promise<void> {
    const next: BotSessionPayload = {};
    if (draft.region) next.region = draft.region;
    await this.sessions.set(parsed.userId, "checkout_flow", next);
    await this.askDeliveryMethod(parsed, conversationId);
  }

  /** Peel the last checkout draft field and re-show the previous wizard step. */
  private async handleCheckoutBack(
    parsed: ParsedInbound,
    conversationId: string,
    _contactId: string | null,
    payload: BotSessionPayload,
  ): Promise<void> {
    const session = await this.sessions.get(parsed.userId);
    let draft = pickCheckoutDraft(payload);

    if (session.state === "checkout_comment") {
      draft = {
        ...draft,
        comment: undefined,
        paymentType: undefined,
        paymentMethod: undefined,
        cod: undefined,
      };
      await this.sessions.set(parsed.userId, "checkout_flow", draft);
      await this.askPayment(parsed, conversationId);
      return;
    }

    if (draft.paymentType || draft.cod) {
      draft = {
        ...draft,
        paymentType: undefined,
        paymentMethod: undefined,
        cod: undefined,
        comment: undefined,
      };
    }

    if (session.state === "checkout_flat") {
      draft = { ...draft, building: undefined, flat: undefined };
      await this.promptBuilding(parsed, conversationId, draft);
      return;
    }
    if (session.state === "checkout_building") {
      draft = {
        ...draft,
        streetRef: undefined,
        streetName: undefined,
        building: undefined,
        flat: undefined,
      };
      await this.promptStreet(parsed, conversationId, draft);
      return;
    }
    if (session.state === "checkout_street" || session.state === "checkout_warehouse_q") {
      draft = {
        region: draft.region,
        deliveryMethod: draft.deliveryMethod,
        deliveryType: draft.deliveryType,
      };
      await this.promptCity(parsed, conversationId, draft);
      return;
    }
    if (session.state === "checkout_city") {
      draft = {
        region: draft.region,
        deliveryMethod: draft.deliveryMethod ?? "NOVA_POSHTA",
      };
      await this.sessions.set(parsed.userId, "checkout_flow", draft);
      await this.askDeliveryType(parsed, conversationId);
      return;
    }

    if (draft.deliveryMethod === "PICKUP") {
      await this.showDeliveryMethodStep(parsed, conversationId, draft);
      return;
    }
    if (draft.profileId) {
      draft = {
        region: draft.region,
        deliveryMethod: draft.deliveryMethod ?? "NOVA_POSHTA",
      };
      await this.sessions.set(parsed.userId, "checkout_flow", draft);
      await this.askDeliveryType(parsed, conversationId);
      return;
    }
    if (draft.warehouseRef) {
      draft = { ...draft, warehouseRef: undefined, warehouseName: undefined };
      await this.promptWarehouse(parsed, conversationId, draft);
      return;
    }
    if (draft.building && draft.streetRef && draft.cityRef) {
      draft = { ...draft, flat: undefined };
      await this.promptFlat(parsed, conversationId, draft);
      return;
    }
    if (draft.streetRef) {
      draft = { ...draft, streetRef: undefined, streetName: undefined, building: undefined, flat: undefined };
      await this.promptStreet(parsed, conversationId, draft);
      return;
    }
    if (draft.cityRef) {
      draft = {
        region: draft.region,
        deliveryMethod: draft.deliveryMethod,
        deliveryType: draft.deliveryType,
      };
      await this.promptCity(parsed, conversationId, draft);
      return;
    }
    if (draft.deliveryType || draft.deliveryMethod) {
      await this.showDeliveryMethodStep(parsed, conversationId, draft);
      return;
    }
    if (draft.region) {
      await this.sessions.set(parsed.userId, "checkout_flow", {});
      await this.replyCheckoutInline(
        parsed.chatId,
        conversationId,
        "Оберіть область доставки:",
        this.buildRegionInlineRows(),
        { back: false },
      );
      return;
    }

    await this.sessions.resetIdle(parsed.userId);
    await this.replyMenu(parsed.chatId, conversationId, TELEGRAM_CANCELLED);
  }

  private async askComment(
    parsed: ParsedInbound,
    conversationId: string,
    _payload: BotSessionPayload,
  ): Promise<void> {
    if (!_payload.paymentType && !_payload.cod) {
      await this.sessions.patchPayload(parsed.userId, "checkout_flow", _payload);
      await this.askPayment(parsed, conversationId);
      return;
    }
    await this.sessions.patchPayload(parsed.userId, "checkout_comment", _payload);
    await this.replyCheckoutInline(
      parsed.chatId,
      conversationId,
      "Коментар до замовлення (напишіть текст або натисніть «Без коментаря»):",
      [[{ text: "⏭ Без коментаря", callback_data: "chk:skipc" }]],
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
        await this.replyCheckoutPrompt(
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
      await this.replyCheckoutInline(
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
      await this.replyCheckoutText(
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
      await this.replyCheckoutPrompt(parsed.chatId, conversationId, "Спочатку вкажіть місто:");
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
        await this.replyCheckoutPrompt(
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
      await this.replyCheckoutInline(
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
      await this.replyCheckoutText(
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
        await this.replyCheckoutPrompt(
          parsed.chatId,
          conversationId,
          "Вулицю не знайдено. Спробуйте ще:",
        );
        return;
      }
      await this.sessions.patchPayload(parsed.userId, "checkout_street", {
        ...payload,
        streetHits: hits,
      });
      await this.replyCheckoutInline(
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
      await this.replyCheckoutText(
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
      await this.requestCheckoutPhone(
        parsed.chatId,
        conversationId,
        "Для оформлення потрібен номер телефону. Чернетку збережено — після номера замовлення створиться саме.",
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
      } else if (!payUrl && wantsPayLink) {
        text += "\n\nМенеджер надішле реквізити для оплати.";
      }
      text += "\n\nСтатус можна дивитись у «Замовлення».";
      await this.replyMenu(parsed.chatId, conversationId, text);
      if (payUrl && wantsPayLink && !payload.cod) {
        await this.replyInline(parsed.chatId, conversationId, "Оплата замовлення:", [
          [{ text: "💳 Оплатити", url: payUrl }],
        ]);
      }
    } catch (err) {
      this.logger.warn(
        `finishCheckout failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      const msg = clientSafeCheckoutError(err);
      // Keep checkout draft + flow keyboard — commerce menu would swallow the next reply as city/comment.
      await this.sessions.set(parsed.userId, "checkout_comment", pickCheckoutDraft(payload));
      await this.replyCheckoutText(
        parsed.chatId,
        conversationId,
        `Не вдалося оформити: ${msg}\nНатисніть «Оформити» в кошику ще раз або «Скасувати».`,
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

  /** Onboarding steps: no commerce reply keyboard (avoids Catalog while filling profile). */
  private async replyOnboardingText(
    chatId: string,
    conversationId: string,
    text: string,
  ): Promise<void> {
    const { messageId } = await this.telegram.sendMessageToChat(chatId, text, {
      menuKeyboard: CLIENT_FLOW_KEYBOARD,
    });
    await this.recordOutbound(conversationId, text, messageId);
  }

  private async replyOnboardingInline(
    chatId: string,
    conversationId: string,
    text: string,
    inlineKeyboard: InlineBtn[][],
  ): Promise<void> {
    // Reply keyboard from the previous onboarding text (Скасувати) stays visible.
    const { messageId } = await this.telegram.sendMessageToChat(chatId, text, {
      inlineKeyboard,
    });
    await this.recordOutbound(conversationId, text, messageId);
  }

  private async replyStartOnly(
    chatId: string,
    conversationId: string,
    text: string,
  ): Promise<void> {
    const { messageId } = await this.telegram.sendMessageToChat(chatId, text, {
      menuKeyboard: CLIENT_START_KEYBOARD,
    });
    await this.recordOutbound(conversationId, text, messageId);
  }

  private async replyCheckoutNotice(chatId: string, conversationId: string): Promise<void> {
    await this.replyCheckoutText(chatId, conversationId, TELEGRAM_CHECKOUT_IN_PROGRESS);
  }

  private async requestCheckoutPhone(
    chatId: string,
    conversationId: string,
    text: string,
  ): Promise<void> {
    const { messageId } = await this.telegram.sendMessageToChat(chatId, text, {
      requestContactButton: true,
      menuKeyboard: CLIENT_FLOW_KEYBOARD,
    });
    await this.recordOutbound(conversationId, text, messageId);
  }

  private async replyCheckoutText(
    chatId: string,
    conversationId: string,
    text: string,
  ): Promise<void> {
    const { messageId } = await this.telegram.sendMessageToChat(chatId, text, {
      menuKeyboard: CLIENT_FLOW_KEYBOARD,
    });
    await this.recordOutbound(conversationId, text, messageId);
  }

  /** Checkout wizard: inline choices + Cancel/Back footer (reply Cancel set on prior text). */
  private async replyCheckoutInline(
    chatId: string,
    conversationId: string,
    text: string,
    inlineKeyboard: InlineBtn[][],
    opts?: { back?: boolean },
  ): Promise<void> {
    const { messageId } = await this.telegram.sendMessageToChat(chatId, text, {
      menuKeyboard: CLIENT_FLOW_KEYBOARD,
      inlineKeyboard: withCheckoutNav(inlineKeyboard, { back: opts?.back !== false }),
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
