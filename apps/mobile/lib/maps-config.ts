import Constants from "expo-constants";
import { Platform } from "react-native";

import { apiFetch } from "@/lib/api";

/** Build-time fallback for Static Maps URLs (EAS env EXPO_PUBLIC_GOOGLE_MAPS_API_KEY). */
export function getEmbeddedMapsApiKey(): string | null {
  const raw = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

/**
 * Native Maps SDK key baked into the binary (AndroidManifest / iOS Info.plist).
 * Server/static keys are NOT enough — mounting MapView without this crashes Android.
 */
export function getNativeGoogleMapsApiKey(): string | null {
  const expoConfig = Constants.expoConfig;
  if (Platform.OS === "android") {
    const key = expoConfig?.android?.config?.googleMaps?.apiKey;
    return typeof key === "string" && key.trim() ? key.trim() : null;
  }
  if (Platform.OS === "ios") {
    const key = expoConfig?.ios?.config?.googleMapsApiKey;
    return typeof key === "string" && key.trim() ? key.trim() : null;
  }
  return null;
}

function nativeBuildOptedIntoInteractiveMaps(): boolean {
  const extra = Constants.expoConfig?.extra as
    | { enableInteractiveGoogleMaps?: unknown }
    | undefined;
  return extra?.enableInteractiveGoogleMaps === true;
}

/**
 * True when interactive MapView is safe to mount (won't SIGABRT for missing API key).
 * Android: require BOTH the baked Manifest key and the build-time extra flag.
 * iOS: Apple Maps provider works without a Google key.
 */
export function canUseInteractiveMaps(): boolean {
  if (Platform.OS === "ios") return true;
  if (Platform.OS !== "android") return false;
  if (!nativeBuildOptedIntoInteractiveMaps()) return false;
  return getNativeGoogleMapsApiKey() != null;
}

/** Server key from CRM settings, then embedded env fallback (Static Maps / Places only). */
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
