import { Platform } from "react-native";

import {
  clearNativeTrackingCredentials,
  isNativeTrackingModuleLoaded,
  syncNativeTrackingCredentials,
} from "../modules/crm-native-tracking";
import { getAuthTokenWithRetry } from "./auth-token";
import { hydrateApiBaseUrl } from "./config";
import {
  runNativeSyncWithRetry,
  type NativeSyncResult,
} from "./native-tracking-session-core";
import { shouldUseNativeTracking } from "./tracking-feature-flag";

export type {
  NativeSyncFailureReason,
  NativeSyncResult,
} from "./native-tracking-session-core";

async function syncNativeTrackingSessionOnce(): Promise<NativeSyncResult> {
  if (Platform.OS !== "android") return { ok: false, reason: "not_android" };
  if (!shouldUseNativeTracking()) return { ok: false, reason: "flag_disabled" };
  if (!isNativeTrackingModuleLoaded()) return { ok: false, reason: "module_missing" };

  const token = await getAuthTokenWithRetry();
  if (!token) return { ok: false, reason: "no_auth_token" };

  const apiBase = await hydrateApiBaseUrl();
  if (!apiBase) return { ok: false, reason: "no_api_url" };

  const synced = await syncNativeTrackingCredentials(token, apiBase);
  if (!synced) return { ok: false, reason: "native_sync_rejected" };
  return { ok: true };
}

/**
 * Push JWT + API base into native DataStore so FGS can upload without JS.
 * Retries once after a short delay (SecureStore / bridge / registry races).
 */
export async function syncNativeTrackingSessionDetailed(opts?: {
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<NativeSyncResult> {
  return runNativeSyncWithRetry(syncNativeTrackingSessionOnce, opts);
}

/** Push JWT + API base into native DataStore so FGS can upload without JS. */
export async function syncNativeTrackingSession(): Promise<boolean> {
  const result = await syncNativeTrackingSessionDetailed();
  return result.ok;
}

export async function clearNativeTrackingSession(): Promise<void> {
  if (Platform.OS !== "android") return;
  await clearNativeTrackingCredentials();
}
