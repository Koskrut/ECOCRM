import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

import { normalizeApiBaseUrl } from "./api-url";

export { normalizeApiBaseUrl } from "./api-url";

const STORAGE_KEY = "crm_api_base_url";

let cachedApiBaseUrl: string | null = null;
let hydrated = false;

/** Build-time / env URL (no storage). Used as one-time seed. */
export function getBuildTimeApiUrl(): string | null {
  const extra =
    (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ??
    (Constants.manifest2 as { extra?: { expoClient?: { extra?: { apiUrl?: string } } } } | undefined)
      ?.extra?.expoClient?.extra?.apiUrl;
  if (typeof extra === "string" && extra.trim()) {
    return extra.trim().replace(/\/+$/, "");
  }
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (typeof env === "string" && env.trim()) {
    return env.trim().replace(/\/+$/, "");
  }
  if (__DEV__) {
    return "http://localhost:3001";
  }
  return null;
}

/**
 * Load stored URL into memory. Seeds from build-time env once if storage is empty.
 * Safe to call from background tasks before getApiBaseUrl().
 */
export async function hydrateApiBaseUrl(): Promise<string | null> {
  if (hydrated) {
    return cachedApiBaseUrl;
  }
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (typeof stored === "string" && stored.trim()) {
      cachedApiBaseUrl = stored.trim().replace(/\/+$/, "");
      hydrated = true;
      return cachedApiBaseUrl;
    }
  } catch {
    /* fall through to seed */
  }

  const build = getBuildTimeApiUrl();
  if (build) {
    try {
      const normalized = normalizeApiBaseUrl(build);
      await AsyncStorage.setItem(STORAGE_KEY, normalized);
      cachedApiBaseUrl = normalized;
    } catch {
      cachedApiBaseUrl = build.replace(/\/+$/, "");
    }
    hydrated = true;
    return cachedApiBaseUrl;
  }

  cachedApiBaseUrl = null;
  hydrated = true;
  return null;
}

/** Sync accessor — call hydrateApiBaseUrl() first (app start / background flush). */
export function getApiBaseUrl(): string {
  if (cachedApiBaseUrl) {
    return cachedApiBaseUrl;
  }
  const build = getBuildTimeApiUrl();
  if (build) {
    return build.replace(/\/+$/, "");
  }
  throw new Error("CRM API URL is not configured");
}

export function getCachedApiBaseUrl(): string | null {
  return cachedApiBaseUrl;
}

export async function setApiBaseUrl(url: string): Promise<string> {
  const normalized = normalizeApiBaseUrl(url);
  await AsyncStorage.setItem(STORAGE_KEY, normalized);
  cachedApiBaseUrl = normalized;
  hydrated = true;
  return normalized;
}

export async function clearApiBaseUrl(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  cachedApiBaseUrl = null;
  hydrated = true;
}

/** GET /system/version (public) to verify the URL points at a CRM API. */
export async function probeApiBaseUrl(base: string, timeoutMs = 8_000): Promise<void> {
  const normalized = normalizeApiBaseUrl(base);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${normalized}/system/version`, {
      method: "GET",
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
