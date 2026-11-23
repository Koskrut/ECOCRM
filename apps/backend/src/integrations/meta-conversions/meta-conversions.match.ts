/** Click and request fields Meta matches without hashing. */

export function normalizeIp(raw?: string | null): string | null {
  if (!raw) return null;
  let value = raw.trim();
  if (!value) return null;
  if (value.startsWith("::ffff:")) value = value.slice(7);
  return value || null;
}

function isPrivateIp(ip: string): boolean {
  const value = ip.toLowerCase();
  if (value === "::1" || value === "0.0.0.0") return true;
  if (value.startsWith("127.") || value.startsWith("10.") || value.startsWith("192.168.") || value.startsWith("169.254.")) {
    return true;
  }
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(value)) return true;
  if (value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80")) return true;
  return false;
}

/** First public address in X-Forwarded-For, otherwise the request address. */
export function clientIpFromRequest(req: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}): string | null {
  const forwarded = req.headers?.["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded.join(",") : (forwarded ?? "");
  const parts = raw
    .split(",")
    .map((part) => normalizeIp(part))
    .filter((part): part is string => Boolean(part));
  const publicIp = parts.find((ip) => !isPrivateIp(ip));
  if (publicIp) return publicIp;
  return normalizeIp(req.ip);
}

export function headerValue(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const text = (raw ?? "").trim();
  if (!text) return null;
  return text.length > 1000 ? text.slice(0, 1000) : text;
}

export function metaClickValue(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (!text || text.length > 500) return null;
  return text;
}

/** Cookie _fbc wins. Otherwise fb.1.<unix ms>.<fbclid>. */
export function metaFbc(input: { fbc?: string | null; fbclid?: string | null; nowMs?: number }): string | null {
  const cookie = metaClickValue(input.fbc);
  if (cookie) return cookie;
  const fbclid = (input.fbclid ?? "").trim();
  if (!fbclid || fbclid.length > 500 || !/^[A-Za-z0-9_-]+$/.test(fbclid)) return null;
  const ms = input.nowMs ?? Date.now();
  return `fb.1.${ms}.${fbclid}`;
}

/** Lowercase, punctuation and spaces removed. Used before hashing city, region and zip. */
export function normalizeMetaGeo(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim().toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "");
  return cleaned || null;
}

export function publicPageUrl(raw: string | null | undefined, fallbackPath = "/"): string {
  const path = fallbackPath.startsWith("/") ? fallbackPath : `/${fallbackPath}`;
  const fallback = `https://www.suprex.dental${path}`;
  const value = (raw ?? "").trim();
  if (!value) return fallback;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return fallback;
    return `${url.origin}${url.pathname || path}${url.search}`;
  } catch {
    return fallback;
  }
}

export function checkoutPageUrl(raw: string | null | undefined): string {
  return publicPageUrl(raw, "/checkout");
}

/** Client event id, or a server fallback when the browser did not send one. */
export function safeMetaEventId(raw: string | null | undefined, fallback: string): string {
  const text = (raw ?? "").trim();
  if (/^[A-Za-z0-9-]{8,80}$/.test(text)) return text;
  return fallback;
}

export function storeEventSourceUrl(path: string, search: string): string {
  const raw = (path || "/").trim();
  const qIndex = raw.indexOf("?");
  let pathname = (qIndex >= 0 ? raw.slice(0, qIndex) : raw) || "/";
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  pathname = pathname.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  if (pathname.includes("..")) pathname = "/";
  const params = new URLSearchParams(qIndex >= 0 ? raw.slice(qIndex + 1) : "");
  const extra = search.startsWith("?") ? search.slice(1) : search;
  new URLSearchParams(extra).forEach((value, key) => {
    if (key) params.set(key, value);
  });
  const query = params.toString();
  return `https://www.suprex.dental${pathname}${query ? `?${query}` : ""}`;
}
