import type { TrackingHealthKind } from "./location-tracking-health";

export type FlushTelemetryPayload = {
  appLastSeenAt: string;
  lastGpsCapturedAt?: string;
  trackingHealthState?: string;
};

export type BuildFlushTelemetryInput = {
  lastGpsCapturedAt: string | null;
  nowIso?: string;
  healthKind?: TrackingHealthKind | null;
};

const HEALTH_KIND_TO_TELEMETRY: Partial<Record<TrackingHealthKind, string>> = {
  healthy: "TRACKING_HEALTHY",
  zombie_fgs: "SERVICE_DEAD",
  task_dead: "SERVICE_DEAD",
  accept_stale: "LOCATION_STALE",
  point_stale: "LOCATION_STALE",
  foreground_only: "LOCATION_STALE",
  no_permission: "SERVICE_DEAD",
  inactive: "SERVICE_DEAD",
};

/** Build POST /field/shifts/:id/samples telemetry block for Expo flush. */
export function buildFlushTelemetryPayload(input: BuildFlushTelemetryInput): FlushTelemetryPayload {
  const appLastSeenAt = input.nowIso ?? new Date().toISOString();
  const payload: FlushTelemetryPayload = { appLastSeenAt };
  if (input.lastGpsCapturedAt) {
    payload.lastGpsCapturedAt = input.lastGpsCapturedAt;
  }
  if (input.healthKind) {
    const mapped = HEALTH_KIND_TO_TELEMETRY[input.healthKind];
    if (mapped) payload.trackingHealthState = mapped;
  }
  return payload;
}
