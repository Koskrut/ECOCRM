import AsyncStorage from "@react-native-async-storage/async-storage";

import { getNativeTrackingHealth } from "../modules/crm-native-tracking";
import {
  getLastAcceptedAt,
  purgePendingSamples,
  STORAGE_KEYS,
} from "./location-tracking-buffer";
import { shouldClearStaleJsLastAcceptedAt } from "./native-buffer-migration-logic";
import { shouldUseNativeTracking } from "./tracking-feature-flag";

/** One-time purge of legacy Expo AsyncStorage buffer after switching to native_android. */
export const NATIVE_BUFFER_PURGED_KEY = "native_buffer_purged_v1";

export { shouldClearStaleJsLastAcceptedAt } from "./native-buffer-migration-logic";

/**
 * Drop stale JS dual-writer artifacts on first native cold start.
 * Clears pending samples always; clears JS lastAcceptedAt when stale vs native FGS.
 */
export async function purgeLegacyJsBufferForNativeMode(): Promise<boolean> {
  if (!shouldUseNativeTracking()) return false;

  const migrated = await AsyncStorage.getItem(NATIVE_BUFFER_PURGED_KEY);
  if (migrated === "1") return false;

  await purgePendingSamples();

  const jsAccept = await getLastAcceptedAt();
  if (jsAccept) {
    let nativeAccept: string | null = null;
    try {
      const nativeHealth = await getNativeTrackingHealth();
      nativeAccept = nativeHealth?.lastServerAcceptAt ?? null;
    } catch {
      /* bridge may be unavailable on first tick */
    }

    if (shouldClearStaleJsLastAcceptedAt(jsAccept, nativeAccept)) {
      await AsyncStorage.removeItem(STORAGE_KEYS.LAST_ACCEPTED_AT);
    }
  }

  await AsyncStorage.setItem(NATIVE_BUFFER_PURGED_KEY, "1");
  return true;
}
