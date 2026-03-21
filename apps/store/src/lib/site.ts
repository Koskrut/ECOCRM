import { headers } from "next/headers";

/** Canonical public origin — must match `metadataBase` in `app/layout.tsx`. */
export const SITE_URL = "https://www.suprex.dental";

/**
 * Absolute site URL for the current request (JSON-LD, OG images).
 * Falls back to {@link SITE_URL} when headers are unavailable.
 */
export async function getRequestSiteUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto =
      h.get("x-forwarded-proto") ??
      (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
    return `${proto}://${host}`;
  }
  return SITE_URL;
}
