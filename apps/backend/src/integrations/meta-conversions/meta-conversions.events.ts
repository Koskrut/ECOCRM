import type {
  AddToCartInput,
  ContactInput,
  InitiateCheckoutInput,
  MetaContentInput,
  PurchaseInput,
  ViewContentInput,
} from "./meta-conversions.types";
import { STORE_EVENT_SOURCE_URL } from "./meta-conversions.types";
import { checkoutPageUrl, publicPageUrl, safeMetaEventId, storeEventSourceUrl } from "./meta-conversions.match";
import { metaUserData, type MetaUserData, type MetaUserInput } from "./meta-conversions.user-data";

export type MetaEventName = "Purchase" | "Contact" | "ViewContent" | "AddToCart" | "InitiateCheckout";

export type MetaContent = { id: string; quantity: number; item_price?: number };

export type MetaCustomData = Record<string, string | number | string[] | MetaContent[]>;

export type MetaEvent = {
  event_name: MetaEventName;
  event_time: number;
  event_id: string;
  action_source: "website" | "other";
  event_source_url?: string;
  user_data: MetaUserData;
  custom_data: MetaCustomData;
};

const PROMO_PATHS = new Set(["/promo/bf", "/promo/bf2026", "/bf", "/bf2026"]);

function splitLocation(path: string, search: string): { pathname: string; promo: string } {
  const raw = (path || "/").trim();
  const qIndex = raw.indexOf("?");
  const pathname = (qIndex >= 0 ? raw.slice(0, qIndex) : raw).replace(/\/+$/, "") || "/";
  const params = new URLSearchParams(qIndex >= 0 ? raw.slice(qIndex + 1) : "");
  const extra = search.startsWith("?") ? search.slice(1) : search;
  new URLSearchParams(extra).forEach((value, key) => params.set(key, value));
  return { pathname, promo: (params.get("promo") ?? "").trim().toLowerCase() };
}

/** Promo page only: query promo=bf / promo=bf2026, or a dedicated promo path. */
export function isPromoView(path: string, search: string): boolean {
  const { pathname, promo } = splitLocation(path, search);
  if (promo === "bf" || promo === "bf2026") return true;
  return PROMO_PATHS.has(pathname);
}

/** Payload of `/start <label>`. A bare `/start` has none. */
export function promoStartLabel(text: string | null | undefined): string | null {
  const raw = (text ?? "").trim();
  const match = raw.match(/^\/start(?:@\w+)?(?:\s+(\S+))?$/i);
  if (!match) return null;
  const label = (match[1] ?? "").trim();
  return label || null;
}

/** Contact only for a start label that is not a cabinet link token. */
export function resolveStartContact(text: string | null | undefined, isLinkToken: boolean): string | null {
  if (isLinkToken) return null;
  return promoStartLabel(text);
}

export function contactEventId(updateId: string | null | undefined, chatId: string, label: string): string {
  const update = (updateId ?? "").trim();
  if (update) return `tg-${update}`;
  return `tg-${chatId}-${label}`;
}

function userOf(input: MetaUserInput): MetaUserData {
  return metaUserData(input);
}

function money(value: number): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100) / 100;
}

function currencyCode(value: string | null | undefined): string {
  const code = (value ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "USD";
}

/** Product rows Meta can match. Empty ids are left out. */
export function metaContents(rows: MetaContentInput[] | null | undefined): MetaContent[] {
  const contents: MetaContent[] = [];
  for (const row of rows ?? []) {
    const id = (row?.id ?? "").trim();
    if (!id) continue;
    const quantity = Math.max(1, Math.floor(Number(row.quantity) || 1));
    const price = Number(row.itemPrice);
    contents.push({
      id,
      quantity,
      ...(Number.isFinite(price) ? { item_price: money(price) } : {}),
    });
    if (contents.length >= 50) break;
  }
  return contents;
}

function withContents(data: MetaCustomData, contents: MetaContent[], contentIds?: string[] | null, numItems?: number | null): void {
  const ids = contents.length
    ? contents.map((row) => row.id)
    : (contentIds ?? []).map((id) => id.trim()).filter(Boolean).slice(0, 50);
  if (ids.length) data.content_ids = ids;
  if (contents.length) data.contents = contents;
  const count = Math.floor(Number(numItems));
  if (Number.isFinite(count) && count > 0) data.num_items = count;
  else if (contents.length) data.num_items = contents.reduce((sum, row) => sum + row.quantity, 0);
}

export function buildPurchaseEvent(input: PurchaseInput, nowSeconds = Math.floor(Date.now() / 1000)): MetaEvent {
  const custom: MetaCustomData = {
    value: money(input.value),
    currency: currencyCode(input.currency),
    content_type: "product",
    channel: input.channel,
  };
  withContents(custom, metaContents(input.contents));
  return {
    event_name: "Purchase",
    event_time: nowSeconds,
    event_id: input.orderId.trim(),
    action_source: "website",
    event_source_url: checkoutPageUrl(input.eventSourceUrl),
    user_data: userOf(input),
    custom_data: custom,
  };
}

export function buildAddToCartEvent(input: AddToCartInput, nowSeconds = Math.floor(Date.now() / 1000)): MetaEvent | null {
  const contentId = input.contentId.trim();
  if (!contentId) return null;
  const quantity = Math.max(1, Math.floor(Number(input.quantity) || 1));
  const unit = Number(input.itemPrice);
  const contents = metaContents([
    { id: contentId, quantity, itemPrice: Number.isFinite(unit) ? unit : null },
  ]);
  const custom: MetaCustomData = {
    value: money(input.value),
    currency: currencyCode(input.currency),
    content_type: "product",
    channel: input.channel,
  };
  const name = (input.contentName ?? "").trim();
  if (name) custom.content_name = name;
  withContents(custom, contents, null, quantity);
  return {
    event_name: "AddToCart",
    event_time: nowSeconds,
    event_id: safeMetaEventId(input.eventId, `atc-${nowSeconds}-${quantity}`),
    action_source: "website",
    event_source_url: publicPageUrl(input.eventSourceUrl, "/"),
    user_data: userOf(input),
    custom_data: custom,
  };
}

export function buildInitiateCheckoutEvent(
  input: InitiateCheckoutInput,
  nowSeconds = Math.floor(Date.now() / 1000),
): MetaEvent | null {
  const contents = metaContents(input.contents);
  const custom: MetaCustomData = {
    value: money(input.value),
    currency: currencyCode(input.currency),
    content_type: "product",
    channel: input.channel === "telegram" ? "telegram" : "website",
  };
  withContents(custom, contents, input.contentIds, input.numItems);
  const eventId = safeMetaEventId(input.eventId, "");
  if (!eventId || !custom.content_ids) return null;
  return {
    event_name: "InitiateCheckout",
    event_time: nowSeconds,
    event_id: eventId,
    action_source: "website",
    event_source_url: checkoutPageUrl(input.eventSourceUrl),
    user_data: userOf(input),
    custom_data: custom,
  };
}

export function buildContactEvent(input: ContactInput, nowSeconds = Math.floor(Date.now() / 1000)): MetaEvent {
  return {
    event_name: "Contact",
    event_time: nowSeconds,
    event_id: input.eventId.trim(),
    action_source: "other",
    user_data: userOf(input),
    custom_data: { content_name: input.label.trim() },
  };
}

export function buildViewContentEvent(input: ViewContentInput, nowSeconds = Math.floor(Date.now() / 1000)): MetaEvent {
  return {
    event_name: "ViewContent",
    event_time: nowSeconds,
    event_id: input.eventId.trim(),
    action_source: "website",
    event_source_url: storeEventSourceUrl(input.path, input.search),
    user_data: userOf(input),
    custom_data: { content_name: "bf" },
  };
}

export function buildTestPurchaseEvent(eventId: string, nowSeconds = Math.floor(Date.now() / 1000)): MetaEvent {
  return {
    event_name: "Purchase",
    event_time: nowSeconds,
    event_id: eventId,
    action_source: "website",
    event_source_url: STORE_EVENT_SOURCE_URL,
    user_data: metaUserData({ externalId: "meta-conversions-test" }),
    custom_data: {
      value: 1,
      currency: "UAH",
      content_type: "product",
      content_name: "Test Purchase",
      channel: "website",
    },
  };
}

/** After the cart row is stored. A Meta failure must not undo the add. */
export async function notifyMetaAddToCart(
  meta: { trackAddToCart(input: AddToCartInput): Promise<unknown> } | undefined,
  input: AddToCartInput,
): Promise<void> {
  try {
    await meta?.trackAddToCart(input);
  } catch {
    // The product is already in the cart.
  }
}

/** When the checkout page is open. A Meta failure must not block the form. */
export async function notifyMetaInitiateCheckout(
  meta: { trackInitiateCheckout(input: InitiateCheckoutInput): Promise<unknown> } | undefined,
  input: InitiateCheckoutInput,
): Promise<void> {
  try {
    await meta?.trackInitiateCheckout(input);
  } catch {
    // Checkout stays available.
  }
}

/** After a successful checkout. A Meta failure stays inside trackPurchase. */
export async function notifyMetaPurchase(
  meta: { trackPurchase(input: PurchaseInput): Promise<void> } | undefined,
  input: PurchaseInput,
): Promise<void> {
  try {
    await meta?.trackPurchase(input);
  } catch {
    // The order is already stored. Meta must not change that.
  }
}

export async function maybeTrackStartContact(
  meta: { trackContact(input: ContactInput): Promise<void> } | undefined,
  params: {
    text: string | null;
    updateId: string | null;
    chatId: string;
    isLinkToken: boolean;
    phone?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    externalId?: string | null;
  },
): Promise<void> {
  const label = resolveStartContact(params.text, params.isLinkToken);
  if (!label || !meta) return;
  try {
    await meta.trackContact({
      eventId: contactEventId(params.updateId, params.chatId, label),
      label,
      phone: params.phone,
      firstName: params.firstName,
      lastName: params.lastName,
      externalId: params.externalId,
    });
  } catch {
    // The bot reply must still go out.
  }
}
