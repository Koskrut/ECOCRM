import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import { appendPendingSample, flushPendingSamples } from "./location-tracking-buffer";

export const FIELD_LOCATION_TASK = "FIELD_LOCATION_TASK";

TaskManager.defineTask(FIELD_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    return;
  }
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  if (!locations?.length) return;

  for (const loc of locations) {
    const c = loc.coords;
    await appendPendingSample({
      lat: c.latitude,
      lng: c.longitude,
      accuracyM:
        typeof c.accuracy === "number" && Number.isFinite(c.accuracy) ? c.accuracy : undefined,
      clientRecordedAt: new Date(loc.timestamp).toISOString(),
    });
  }

  try {
    await flushPendingSamples();
  } catch {
    /* buffered for next flush */
  }
});
