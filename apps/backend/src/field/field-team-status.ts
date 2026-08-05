import {
  GPS_NONE_THRESHOLD_MS,
  GPS_STALE_THRESHOLD_MS,
  PRESENCE_ONLINE_THRESHOLD_MS,
} from "../presence/presence.constants";

export type GpsTeamStatus = "ok" | "stale" | "none" | "disabled";

export type AppPresenceState = "ACTIVE" | "BACKGROUND" | "INACTIVE";

export type TrackingModeValue = "background" | "foreground" | "none";

export type FieldTeamDevicePresence = {
  appState: AppPresenceState | null;
  trackingMode: TrackingModeValue | null;
  lastSeenAt: string | null;
};

type PresenceSessionRow = {
  lastSeenAt: Date;
  appState: string | null;
  trackingMode: string | null;
};

export function deriveGpsStatus(
  trackingEnabled: boolean,
  lastSampleAt: Date | string | null | undefined,
  nowMs = Date.now(),
): GpsTeamStatus {
  if (!trackingEnabled) return "disabled";
  if (lastSampleAt == null) return "none";
  const at =
    typeof lastSampleAt === "string"
      ? new Date(lastSampleAt).getTime()
      : lastSampleAt.getTime();
  if (!Number.isFinite(at)) return "none";
  const ageMs = nowMs - at;
  if (ageMs > GPS_NONE_THRESHOLD_MS) return "none";
  if (ageMs > GPS_STALE_THRESHOLD_MS) return "stale";
  return "ok";
}

export function deriveDevicePresence(
  session: PresenceSessionRow | null | undefined,
  nowMs = Date.now(),
): FieldTeamDevicePresence | null {
  if (!session) return null;

  const lastSeenAt = session.lastSeenAt.toISOString();
  const isReachable = nowMs - session.lastSeenAt.getTime() < PRESENCE_ONLINE_THRESHOLD_MS;

  if (!isReachable) {
    return {
      appState: null,
      trackingMode: parseTrackingMode(session.trackingMode),
      lastSeenAt,
    };
  }

  return {
    appState: parseAppState(session.appState),
    trackingMode: parseTrackingMode(session.trackingMode),
    lastSeenAt,
  };
}

function parseAppState(value: string | null | undefined): AppPresenceState | null {
  if (value === "ACTIVE" || value === "BACKGROUND" || value === "INACTIVE") {
    return value;
  }
  return null;
}

function parseTrackingMode(value: string | null | undefined): TrackingModeValue | null {
  if (value === "background" || value === "foreground" || value === "none") {
    return value;
  }
  return null;
}
