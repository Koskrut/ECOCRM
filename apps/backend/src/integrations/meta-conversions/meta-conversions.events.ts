import type { ContactInput, PurchaseInput, ViewContentInput } from "./meta-conversions.types";
import { STORE_EVENT_SOURCE_URL } from "./meta-conversions.types";
import { checkoutPageUrl, storeEventSourceUrl } from "./meta-conversions.match";
import { metaUserData, type MetaUserData, type MetaUserInput } from "./meta-conversions.user-data";

export type MetaEventName = "Purchase" | "Contact" | "ViewContent";

export type MetaEvent = {
  event_name: MetaEventName;
  event_time: number;
  event_id: string;
  action_source: "website" | "other";
  event_source_url?: string;
  user_data: MetaUserData;
  custom_data: Record<string, string | number>;
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

export function buildPurchaseEvent(input: PurchaseInput, nowSeconds = Math.floor(Date.now() / 1000)): MetaEvent {
  const currency = input.currency.trim().toUpperCase();
  return {
    event_name: "Purchase",
    event_time: nowSeconds,
    event_id: input.orderId.trim(),
    action_source: "website",
    event_source_url: checkoutPageUrl(input.eventSourceUrl),
    user_data: userOf(input),
    custom_data: {
      value: Number(input.value) || 0,
      currency,
      content_type: "product",
      channel: input.channel,
    },
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
