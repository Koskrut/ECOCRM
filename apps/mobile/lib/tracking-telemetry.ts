import { getAuthToken } from "./auth-token";
import { getApiBaseUrl, hydrateApiBaseUrl } from "./config";
import type { TrackingRestartReason } from "./location-tracking-restart";

export type TrackingEventType = "tracking_task_restarted" | "gps_zombie_detected";

export async function sendTrackingRestartEvent(
  shiftId: string,
  reason: TrackingRestartReason,
): Promise<void> {
  const token = await getAuthToken();
  if (!token) return;

  try {
    await hydrateApiBaseUrl();
    await fetch(`${getApiBaseUrl()}/field/shifts/${shiftId}/tracking-events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        type: "tracking_task_restarted" satisfies TrackingEventType,
        reason,
        clientRecordedAt: new Date().toISOString(),
      }),
    });
  } catch {
    /* telemetry must not block restart */
  }
}

export async function sendGpsZombieDetectedEvent(shiftId: string): Promise<void> {
  const token = await getAuthToken();
  if (!token) return;

  try {
    await hydrateApiBaseUrl();
    await fetch(`${getApiBaseUrl()}/field/shifts/${shiftId}/tracking-events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        type: "gps_zombie_detected" satisfies TrackingEventType,
        reason: "zombie_fgs",
        clientRecordedAt: new Date().toISOString(),
      }),
    });
  } catch {
    /* telemetry must not block */
  }
}
