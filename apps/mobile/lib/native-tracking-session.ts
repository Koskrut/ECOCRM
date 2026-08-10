import { Platform } from "react-native";

import {
  clearNativeTrackingCredentials,
  syncNativeTrackingCredentials,
} from "../modules/crm-native-tracking";
import { getAuthToken } from "./auth-token";
import { getCachedApiBaseUrl, hydrateApiBaseUrl } from "./config";
import { shouldUseNativeTracking } from "./tracking-feature-flag";

/** Push JWT + API base into native DataStore so FGS can upload without JS. */
export async function syncNativeTrackingSession(): Promise<boolean> {
  if (Platform.OS !== "android" || !shouldUseNativeTracking()) return false;
  const token = await getAuthToken();
  if (!token) return false;
  await hydrateApiBaseUrl();
  const apiBase = getCachedApiBaseUrl();
  if (!apiBase) return false;
  return syncNativeTrackingCredentials(token, apiBase);
}

export async function clearNativeTrackingSession(): Promise<void> {
  if (Platform.OS !== "android") return;
  await clearNativeTrackingCredentials();
}
