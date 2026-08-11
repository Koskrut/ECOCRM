import AsyncStorage from "@react-native-async-storage/async-storage";

import { getAuthToken } from "./auth-token";
import { formatKyivDateKey } from "./date";
import { writeFieldShiftSnapshot } from "./field-shift-snapshot";
import { purgeLegacyJsBufferForNativeMode } from "./native-buffer-migration";
import { STORAGE_KEYS } from "./location-tracking-buffer";
import type { TrackingMode } from "./location-tracking-health";
import { shouldUseNativeTracking } from "./tracking-feature-flag";
import {
  validateShiftBootstrapPrerequisites,
  type ShiftBootstrapResult,
} from "./location-shift-bootstrap-gate";

export type { ShiftBootstrapFailureReason, ShiftBootstrapResult } from "./location-shift-bootstrap-gate";
export { validateShiftBootstrapPrerequisites } from "./location-shift-bootstrap-gate";

/**
 * Persist shift id + Kyiv day before any GPS sample or flush.
 * Prevents «pending but no active shift id» / «no auth token» race at shift start.
 */
export async function bootstrapShiftTrackingContext(shiftId: string): Promise<ShiftBootstrapResult> {
  const token = await getAuthToken();
  const gate = validateShiftBootstrapPrerequisites(shiftId, !!token);
  if (!gate.ok) return gate;

  if (shouldUseNativeTracking()) {
    await purgeLegacyJsBufferForNativeMode();
  }

  const previousShiftId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
  if (previousShiftId && previousShiftId !== shiftId) {
    const { purgePendingSamples } = await import("./location-tracking-buffer");
    await purgePendingSamples();
    if (shouldUseNativeTracking()) {
      const { purgeNativePendingSamples } = await import("../modules/crm-native-tracking");
      await purgeNativePendingSamples();
    }
  }

  await AsyncStorage.multiSet([
    [STORAGE_KEYS.ACTIVE_SHIFT_ID, shiftId],
    [STORAGE_KEYS.ACTIVE_SHIFT_DAY_KEY, formatKyivDateKey()],
  ]);
  const trackingMode =
    ((await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE)) as TrackingMode | null) ?? "none";
  await writeFieldShiftSnapshot({
    shiftId,
    trackingMode,
    startedAt: new Date().toISOString(),
  });
  return { ok: true };
}

export async function readActiveShiftId(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
}
