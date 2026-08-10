import type { FieldTrackingHealthState } from "@prisma/client";
import {
  GPS_NONE_THRESHOLD_MS,
  GPS_STALE_THRESHOLD_MS,
  PRESENCE_ONLINE_THRESHOLD_MS,
} from "../presence/presence.constants";

const HEALTH = {
  TRACKING_HEALTHY: "TRACKING_HEALTHY",
  NETWORK_DEGRADED: "NETWORK_DEGRADED",
  LOCATION_STALE: "LOCATION_STALE",
  SERVICE_DEAD: "SERVICE_DEAD",
  RECOVERY_IN_PROGRESS: "RECOVERY_IN_PROGRESS",
  RECOVERY_FAILED: "RECOVERY_FAILED",
} as const satisfies Record<string, FieldTrackingHealthState>;

export type TrackingTelemetryTimestamps = {
  appLastSeenAt: Date | string | null | undefined;
  nativeLastSeenAt: Date | string | null | undefined;
  lastGpsCapturedAt: Date | string | null | undefined;
  lastServerAcceptAt: Date | string | null | undefined;
  trackingHealthState: FieldTrackingHealthState | null | undefined;
  /** Server-side last accepted GPS sample (B3 ground truth for supervisors). */
  lastSampleAt: Date | string | null | undefined;
  trackingEnabled: boolean;
};

export type FieldTeamTrackingTelemetry = {
  appLastSeenAt: string | null;
  nativeLastSeenAt: string | null;
  lastGpsCapturedAt: string | null;
  lastServerAcceptAt: string | null;
  trackingHealthState: FieldTrackingHealthState | null;
  /** Derived when client did not report trackingHealthState. */
  derivedHealthState: FieldTrackingHealthState;
};

function toMs(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const ms = typeof value === "string" ? new Date(value).getTime() : value.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function iso(value: Date | string | null | undefined): string | null {
  const ms = toMs(value);
  if (ms == null) return null;
  return new Date(ms).toISOString();
}

/**
 * Derive supervisor-visible tracking health from split telemetry.
 * GPS staleness uses lastServerAcceptAt / lastSampleAt — never appLastSeenAt alone.
 */
export function deriveTrackingHealthState(
  input: TrackingTelemetryTimestamps,
  nowMs = Date.now(),
): FieldTrackingHealthState {
  if (input.trackingHealthState === HEALTH.RECOVERY_IN_PROGRESS) {
    return HEALTH.RECOVERY_IN_PROGRESS;
  }
  if (input.trackingHealthState === HEALTH.RECOVERY_FAILED) {
    return HEALTH.RECOVERY_FAILED;
  }
  if (input.trackingHealthState === HEALTH.SERVICE_DEAD) {
    return HEALTH.SERVICE_DEAD;
  }

  if (!input.trackingEnabled) {
    return HEALTH.TRACKING_HEALTHY;
  }

  const b3Ms =
    toMs(input.lastServerAcceptAt) ??
    toMs(input.lastSampleAt);
  const b1Ms = toMs(input.lastGpsCapturedAt);
  const nativeMs = toMs(input.nativeLastSeenAt);

  if (nativeMs != null && nowMs - nativeMs > PRESENCE_ONLINE_THRESHOLD_MS * 2) {
    return HEALTH.SERVICE_DEAD;
  }

  if (b3Ms == null) {
    if (b1Ms != null && nowMs - b1Ms <= GPS_STALE_THRESHOLD_MS) {
      return HEALTH.NETWORK_DEGRADED;
    }
    return HEALTH.LOCATION_STALE;
  }

  const b3Age = nowMs - b3Ms;
  if (b3Age > GPS_NONE_THRESHOLD_MS) {
    return HEALTH.LOCATION_STALE;
  }
  if (b3Age > GPS_STALE_THRESHOLD_MS) {
    return HEALTH.LOCATION_STALE;
  }

  if (
    b1Ms != null &&
    b3Ms != null &&
    b1Ms > b3Ms + GPS_STALE_THRESHOLD_MS
  ) {
    return HEALTH.NETWORK_DEGRADED;
  }

  if (input.trackingHealthState === HEALTH.NETWORK_DEGRADED) {
    return HEALTH.NETWORK_DEGRADED;
  }
  if (input.trackingHealthState === HEALTH.LOCATION_STALE) {
    return HEALTH.LOCATION_STALE;
  }

  return HEALTH.TRACKING_HEALTHY;
}

export function formatTrackingTelemetry(
  row: {
    lastSeenAt: Date;
    appLastSeenAt: Date | null;
    nativeLastSeenAt: Date | null;
    lastGpsCapturedAt: Date | null;
    lastServerAcceptAt: Date | null;
    trackingHealthState: FieldTrackingHealthState | null;
  } | null | undefined,
  opts: {
    trackingEnabled: boolean;
    lastSampleAt: Date | string | null | undefined;
    nowMs?: number;
  },
): FieldTeamTrackingTelemetry | null {
  if (!row) return null;

  const appLastSeenAt = row.appLastSeenAt ?? row.lastSeenAt;
  const timestamps: TrackingTelemetryTimestamps = {
    appLastSeenAt,
    nativeLastSeenAt: row.nativeLastSeenAt,
    lastGpsCapturedAt: row.lastGpsCapturedAt,
    lastServerAcceptAt: row.lastServerAcceptAt,
    trackingHealthState: row.trackingHealthState,
    lastSampleAt: opts.lastSampleAt,
    trackingEnabled: opts.trackingEnabled,
  };

  return {
    appLastSeenAt: iso(appLastSeenAt),
    nativeLastSeenAt: iso(row.nativeLastSeenAt),
    lastGpsCapturedAt: iso(row.lastGpsCapturedAt),
    lastServerAcceptAt: iso(row.lastServerAcceptAt),
    trackingHealthState: row.trackingHealthState,
    derivedHealthState: deriveTrackingHealthState(timestamps, opts.nowMs),
  };
}

export function parseSampleSource(
  value: string | undefined,
): FieldLocationSampleSourceLike | undefined {
  if (value === "expo" || value === "EXPO") return "EXPO";
  if (value === "native_android" || value === "NATIVE_ANDROID") return "NATIVE_ANDROID";
  return undefined;
}

type FieldLocationSampleSourceLike = "EXPO" | "NATIVE_ANDROID";

export function parseTrackingHealthState(
  value: string | undefined,
): FieldTrackingHealthState | undefined {
  if (!value) return undefined;
  const normalized = value.toUpperCase();
  const allowed = Object.values(HEALTH);
  if (allowed.includes(normalized as FieldTrackingHealthState)) {
    return normalized as FieldTrackingHealthState;
  }
  return undefined;
}
