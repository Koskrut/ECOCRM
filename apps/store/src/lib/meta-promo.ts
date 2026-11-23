import { getAttributionSnapshot } from "@/lib/attribution";
import { trackMetaStandard } from "@/lib/tracking";

const PROMO_PATHS = new Set(["/promo/bf", "/promo/bf2026", "/bf", "/bf2026"]);

type BrowserConfig = { pixelId: string | null; enabled: boolean };

let configPromise: Promise<BrowserConfig> | null = null;

/** Same marker as the server: query promo=bf / promo=bf2026, or a dedicated promo path. */
export function isPromoViewTarget(path: string, search: string): boolean {
  const raw = (path || "/").trim();
  const qIndex = raw.indexOf("?");
  const pathname = (qIndex >= 0 ? raw.slice(0, qIndex) : raw).replace(/\/+$/, "") || "/";
  const params = new URLSearchParams(qIndex >= 0 ? raw.slice(qIndex + 1) : "");
  const extra = search.startsWith("?") ? search.slice(1) : search;
  new URLSearchParams(extra).forEach((value, key) => params.set(key, value));
  const promo = (params.get("promo") ?? "").trim().toLowerCase();
  if (promo === "bf" || promo === "bf2026") return true;
  return PROMO_PATHS.has(pathname);
}

export function prefetchMetaConversions(): Promise<BrowserConfig> {
  if (typeof window === "undefined") return Promise.resolve({ pixelId: null, enabled: false });
  if (!configPromise) {
    configPromise = fetch("/api/store/meta/config", {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    })
      .then((res) => (res.ok ? (res.json() as Promise<BrowserConfig>) : { pixelId: null, enabled: false }))
      .catch(() => ({ pixelId: null, enabled: false }));
  }
  return configPromise;
}

function viewEventId(path: string, search: string): string {
  const key = `suprex_meta_vc:${path}${search}`;
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return `vc-${path}${search}`;
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`));
  if (!match?.[1]) return null;
  try {
    const value = decodeURIComponent(match[1]).trim();
    return value || null;
  } catch {
    return match[1].trim() || null;
  }
}

/** fbp/fbc cookies and the fbclid already stored for this visit. Empty values are omitted. */
export function readMetaClickIds(): { fbp?: string; fbc?: string; fbclid?: string } {
  const fbp = readCookie("_fbp");
  const fbc = readCookie("_fbc");
  const fbclid = getAttributionSnapshot().fbclid?.trim() || null;
  return {
    ...(fbp ? { fbp } : {}),
    ...(fbc ? { fbc } : {}),
    ...(fbclid ? { fbclid } : {}),
  };
}

const posted = new Set<string>();

/** Server event does not wait for marketing consent. The browser pixel does. */
export async function reportPromoView(path: string, search: string): Promise<void> {
  if (!isPromoViewTarget(path, search)) return;
  const eventId = viewEventId(path, search);
  if (!posted.has(eventId)) {
    posted.add(eventId);
    try {
      await fetch("/api/store/meta/view-content", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, path, search, ...readMetaClickIds() }),
      });
    } catch {
      posted.delete(eventId);
    }
  }
  const config = await prefetchMetaConversions();
  if (!config.enabled || !config.pixelId) return;
  trackMetaStandard("ViewContent", { content_name: "bf" }, eventId, config.pixelId);
}

type CommerceContent = { id: string; quantity: number; itemPrice?: number };

function commercePayload(input: {
  value: number;
  currency: string;
  channel?: "website" | "telegram";
  contentIds?: string[];
  contents?: CommerceContent[];
  numItems?: number;
  contentName?: string;
}) {
  const contents = (input.contents ?? [])
    .filter((row) => row.id)
    .map((row) => ({
      id: row.id,
      quantity: row.quantity,
      ...(row.itemPrice != null ? { item_price: row.itemPrice } : {}),
    }));
  const contentIds = contents.length ? contents.map((row) => row.id) : (input.contentIds ?? []).filter(Boolean);
  return {
    value: input.value,
    currency: input.currency,
    content_type: "product",
    ...(input.channel ? { channel: input.channel } : {}),
    ...(input.contentName ? { content_name: input.contentName } : {}),
    ...(contentIds.length ? { content_ids: contentIds } : {}),
    ...(contents.length ? { contents } : {}),
    ...(input.numItems && input.numItems > 0 ? { num_items: input.numItems } : {}),
  };
}

async function trackStoreCommerce(
  eventName: "AddToCart" | "InitiateCheckout" | "Purchase",
  eventId: string,
  payload: ReturnType<typeof commercePayload>,
): Promise<void> {
  const config = await prefetchMetaConversions();
  if (!config.enabled || !config.pixelId || !eventId) return;
  trackMetaStandard(eventName, payload, eventId, config.pixelId);
}

const CHECKOUT_EVENT_KEY = "suprex_meta_ic";

function rememberCheckoutEventId(): string {
  try {
    const existing = sessionStorage.getItem(CHECKOUT_EVENT_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(CHECKOUT_EVENT_KEY, id);
    return id;
  } catch {
    return "ic-checkout";
  }
}

/** Lets the next checkout in this tab send a new InitiateCheckout. */
export function clearInitiateCheckout(): void {
  try {
    sessionStorage.removeItem(CHECKOUT_EVENT_KEY);
  } catch {
    // The purchase is already stored.
  }
}

/** Start of checkout. The server event does not wait for marketing consent. */
export async function reportInitiateCheckout(input: {
  value: number;
  currency: string;
  contentIds: string[];
  contents: CommerceContent[];
  numItems: number;
  channel: "website" | "telegram";
  eventSourceUrl: string;
}): Promise<void> {
  if (!input.contentIds.length) return;
  const eventId = rememberCheckoutEventId();
  if (!posted.has(eventId)) {
    posted.add(eventId);
    try {
      await fetch("/api/store/meta/initiate-checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          value: input.value,
          currency: input.currency,
          contentIds: input.contentIds,
          contents: input.contents,
          numItems: input.numItems,
          channel: input.channel,
          eventSourceUrl: input.eventSourceUrl,
          ...readMetaClickIds(),
        }),
      });
    } catch {
      posted.delete(eventId);
    }
  }
  try {
    await trackStoreCommerce("InitiateCheckout", eventId, commercePayload(input));
  } catch {
    // The checkout form is already on screen.
  }
}

export async function trackStoreAddToCart(input: {
  eventId: string;
  value: number;
  currency: string;
  contentId: string;
  contentName?: string;
  quantity: number;
  itemPrice: number;
}): Promise<void> {
  try {
    await trackStoreCommerce(
      "AddToCart",
      input.eventId,
      commercePayload({
        value: input.value,
        currency: input.currency,
        contentName: input.contentName,
        contentIds: [input.contentId],
        contents: [{ id: input.contentId, quantity: input.quantity, itemPrice: input.itemPrice }],
        numItems: input.quantity,
      }),
    );
  } catch {
    // The product is already in the cart.
  }
}

export async function trackStorePurchase(input: {
  orderId: string;
  value: number;
  currency: string;
  channel: "website" | "telegram";
  contents?: CommerceContent[];
}): Promise<void> {
  try {
    const contents = input.contents ?? [];
    await trackStoreCommerce(
      "Purchase",
      input.orderId,
      commercePayload({
        value: input.value,
        currency: input.currency,
        channel: input.channel,
        contents,
        numItems: contents.reduce((sum, row) => sum + row.quantity, 0),
      }),
    );
  } catch {
    // The order is already placed. The browser pixel is optional.
  }
}
