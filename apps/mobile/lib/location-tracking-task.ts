import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import { FIELD_LOCATION_TASK, FLUSH_INTERVAL_MS } from "./location-tracking-config";
import {
  appendPendingSample,
  flushPendingSamples,
  maybeFlushAfterAppend,
  STORAGE_KEYS,
} from "./location-tracking-buffer";
import { readFieldShiftSnapshot } from "./field-shift-snapshot";
import { bootstrapShiftTrackingContext } from "./location-shift-bootstrap";
import { shouldFlushByInterval } from "./location-flush-schedule";
import { processLocationUpdate } from "./location-tracking-processor";
import { hydrateApiBaseUrl } from "./config";
import { appendErrorLog } from "./error-log";
import { validateRawLocationSample } from "./location-region-check";
import { sendPresenceHeartbeatFromTask } from "./presence-heartbeat";
import { getLastFlushBlockReason, hydrateSessionAuthFromStorage } from "./session-auth";
import { setPendingAdaptiveTier } from "./location-tracking-restart";
import type { SamplingTier } from "./location-tracking-config";

export { FIELD_LOCATION_TASK };

/** Injected from location-tracking.ts to avoid circular imports during tier changes in foreground mode. */
let foregroundWatchStarter: ((tier: SamplingTier) => Promise<void>) | null = null;

export function setForegroundWatchStarter(fn: (tier: SamplingTier) => Promise<void>): void {
  foregroundWatchStarter = fn;
}

/** Cold wake: re-bind shift id from persisted snapshot when React context is not ready. */
async function hydrateShiftFromSnapshot(): Promise<void> {
  const stored = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
  if (stored) return;
  const snapshot = await readFieldShiftSnapshot();
  if (snapshot?.status === "ACTIVE") {
    await bootstrapShiftTrackingContext(snapshot.shiftId).catch(() => undefined);
    if (snapshot.trackingMode) {
      await AsyncStorage.setItem(STORAGE_KEYS.TRACKING_MODE, snapshot.trackingMode);
    }
  }
}

function isMockLocation(loc: Location.LocationObject): boolean {
  return (
    (loc as { mocked?: boolean }).mocked === true ||
    (loc as { isFromMockProvider?: boolean }).isFromMockProvider === true
  );
}

/** Testable core of the background task location loop. */
export async function processFieldLocationBatch(
  locations: Location.LocationObject[],
): Promise<void> {
  const block = getLastFlushBlockReason();
  if (block === "wrong_day" || block === "auth_401" || block === "stale_gps") {
    return;
  }

  for (const loc of locations) {
    const c = loc.coords;
    const validated = validateRawLocationSample({
      lat: c.latitude,
      lng: c.longitude,
      accuracyM:
        typeof c.accuracy === "number" && Number.isFinite(c.accuracy) ? c.accuracy : undefined,
      mocked: isMockLocation(loc),
    });
    if (!validated.ok) {
      void appendErrorLog(validated.logLine, "warn");
      continue;
    }

    const result = await processLocationUpdate({
      lat: validated.lat,
      lng: validated.lng,
      accuracyM:
        typeof c.accuracy === "number" && Number.isFinite(c.accuracy) ? c.accuracy : undefined,
      clientRecordedAt: new Date(loc.timestamp).toISOString(),
    });

    if (result.accepted && result.sample) {
      const count = await appendPendingSample(result.sample);
      void maybeFlushAfterAppend(count).catch(() => undefined);
      void sendPresenceHeartbeatFromTask().catch(() => undefined);
    }

    if (result.tierChanged) {
      // Background task must never stop/start FGS — defer tier apply to AppState=active.
      await setPendingAdaptiveTier(result.tier);
    }
  }
}

/**
 * Must run at module load (Expo requirement) — imported from app/_layout.tsx.
 * Do not move defineTask into an async function or React lifecycle.
 */
if (!TaskManager.isTaskDefined(FIELD_LOCATION_TASK)) {
  TaskManager.defineTask(FIELD_LOCATION_TASK, async ({ data, error }) => {
    await hydrateApiBaseUrl();
    await hydrateSessionAuthFromStorage();
    await hydrateShiftFromSnapshot();

    const tryIntervalFlush = async () => {
      const lastFlushAt = await AsyncStorage.getItem(STORAGE_KEYS.LAST_FLUSH_AT);
      if (shouldFlushByInterval(lastFlushAt)) {
        await flushPendingSamples();
      }
    };

    if (error) {
      await tryIntervalFlush().catch(() => undefined);
      return;
    }

    const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;

    if (!locations?.length) {
      await tryIntervalFlush().catch(() => undefined);
      return;
    }

    await processFieldLocationBatch(locations);

    try {
      await flushPendingSamples();
    } catch {
      /* buffered for next flush */
    }
  });
}

/** @deprecated Task is registered at import time; kept for call-site compatibility. */
export async function registerFieldLocationTask(): Promise<boolean> {
  return TaskManager.isTaskDefined(FIELD_LOCATION_TASK);
}
