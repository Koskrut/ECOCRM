import { getAuthToken } from "./auth-token";
import { getApiBaseUrl } from "./config";
import type { TrackingRestartReason } from "./location-tracking-restart";

export type TrackingEventType = "tracking_task_restarted";

export async function sendTrackingRestartEvent(
  shiftId: string,
  reason: TrackingRestartReason,
): Promise<void> {
  const token = await getAuthToken();
  if (!token) return;

  try {
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
