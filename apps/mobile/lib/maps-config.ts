import { apiFetch } from "@/lib/api";

/** Build-time fallback (EAS env EXPO_PUBLIC_GOOGLE_MAPS_API_KEY). */
export function getEmbeddedMapsApiKey(): string | null {
  const raw = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

/** Server key from CRM settings, then embedded env fallback. */
export async function resolveMapsApiKey(token: string): Promise<string | null> {
  try {
    const cfg = await apiFetch<{ mapsApiKey?: string | null }>("/settings/google-maps/public", {
      token,
    });
    const server = typeof cfg.mapsApiKey === "string" ? cfg.mapsApiKey.trim() : "";
    if (server) return server;
  } catch {
    // fall through to embedded key
  }
  return getEmbeddedMapsApiKey();
}
