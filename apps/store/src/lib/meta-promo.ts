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
        body: JSON.stringify({ eventId, path, search }),
      });
    } catch {
      posted.delete(eventId);
    }
  }
  const config = await prefetchMetaConversions();
  if (!config.enabled || !config.pixelId) return;
  trackMetaStandard("ViewContent", { content_name: "bf" }, eventId, config.pixelId);
}

export async function trackStorePurchase(input: {
  orderId: string;
  value: number;
  currency: string;
  channel: "website" | "telegram";
}): Promise<void> {
  try {
    const config = await prefetchMetaConversions();
    if (!config.enabled || !config.pixelId || !input.orderId) return;
    trackMetaStandard(
      "Purchase",
      {
        value: input.value,
        currency: input.currency,
        content_type: "product",
        channel: input.channel,
      },
      input.orderId,
      config.pixelId,
    );
  } catch {
    // The order is already placed. The browser pixel is optional.
  }
}
