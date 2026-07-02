export type FieldShiftLastSample = {
  lat: number;
  lng: number;
  accuracyM: number | null;
  clientRecordedAt: string;
};

export type FieldShiftCurrentVisit = {
  id: string;
  title: string | null;
  status: string;
};

export type FieldTeamDevicePresence = {
  appState: "ACTIVE" | "BACKGROUND" | "INACTIVE" | null;
  trackingMode: "background" | "foreground" | "none" | null;
  lastSeenAt: string | null;
};

export type FieldTeamGpsStatus = "ok" | "stale" | "none" | "disabled";

export type FieldTeamTrackingRestartReason =
  | "os_kill"
  | "tier_change"
  | "appstate"
  | "watchdog";

export type FieldTeamTrackingRestart = {
  lastRestartAt: string | null;
  restartCountToday: number;
  lastRestartReason: FieldTeamTrackingRestartReason | null;
};

export type FieldShiftTeamItem = {
  shift: {
    id: string;
    ownerId: string;
    date: string;
    status: string;
    startedAt: string;
    endedAt: string | null;
    trackingEnabled: boolean;
    plannedDistanceKm: number | null;
  };
  owner: { id: string; fullName: string; email: string };
  lastSample: FieldShiftLastSample | null;
  sampleCountToday: number;
  currentVisit: FieldShiftCurrentVisit | null;
  device: FieldTeamDevicePresence | null;
  gpsStatus: FieldTeamGpsStatus;
  trackingRestart: FieldTeamTrackingRestart | null;
};
