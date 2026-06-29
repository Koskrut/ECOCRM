import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import { applyAdaptiveTier } from "./location-tracking-adaptive";
import { FIELD_LOCATION_TASK } from "./location-tracking-config";
import {
  appendPendingSample,
  flushPendingSamples,
  maybeFlushAfterAppend,
} from "./location-tracking-buffer";
import { processLocationUpdate } from "./location-tracking-processor";
import { sendPresenceHeartbeatFromTask } from "./presence-heartbeat";
import type { SamplingTier } from "./location-tracking-config";

export { FIELD_LOCATION_TASK };

/** Injected from location-tracking.ts to avoid circular imports during tier changes in foreground mode. */
let foregroundWatchStarter: ((tier: SamplingTier) => Promise<void>) | null = null;

export function setForegroundWatchStarter(fn: (tier: SamplingTier) => Promise<void>): void {
  foregroundWatchStarter = fn;
}

/**
 * Must run at module load (Expo requirement) — imported from app/_layout.tsx.
 * Do not move defineTask into an async function or React lifecycle.
 */
if (!TaskManager.isTaskDefined(FIELD_LOCATION_TASK)) {
  TaskManager.defineTask(FIELD_LOCATION_TASK, async ({ data, error }) => {
    if (error) return;
    const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
    if (!locations?.length) return;

    for (const loc of locations) {
      const c = loc.coords;
      const result = await processLocationUpdate({
        lat: c.latitude,
        lng: c.longitude,
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
        try {
          await applyAdaptiveTier(result.tier, foregroundWatchStarter ?? (async () => {}));
        } catch {
          /* tier restart best-effort */
        }
      }
    }

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
