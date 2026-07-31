import { apiHttp } from "../client";

export type FieldShiftSummary = {
  id: string;
  ownerId: string;
  date: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  trackingEnabled: boolean;
  plannedDistanceKm: number | null;
};

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

export type FieldTeamGpsWarning = "region_mismatch" | "empty_track" | null;

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
  shift: FieldShiftSummary;
  owner: { id: string; fullName: string; email: string };
  lastSample: FieldShiftLastSample | null;
  sampleCountToday: number;
  currentVisit: FieldShiftCurrentVisit | null;
  device: FieldTeamDevicePresence | null;
  gpsStatus: FieldTeamGpsStatus;
  gpsWarning?: FieldTeamGpsWarning;
  trackingRestart: FieldTeamTrackingRestart | null;
};

export type FieldLocationSampleRow = {
  id: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
  clientRecordedAt: string;
  createdAt: string;
};

export type FieldTrackGeometry = {
  sampleCount: number;
  path: Array<{ lat: number; lng: number }>;
  source: "osrm" | "fallback" | "none";
  distanceKm: number | null;
  droppedReasons?: Record<string, number>;
  reanchorUsed?: boolean;
};

export const fieldShiftsApi = {
  getActive: async (): Promise<{ shift: FieldShiftSummary | null }> => {
    const res = await apiHttp.get<{ shift: FieldShiftSummary | null }>("/field/shifts/active");
    return res.data;
  },

  getActiveTeam: async (): Promise<{ items: FieldShiftTeamItem[] }> => {
    const res = await apiHttp.get<{ items: FieldShiftTeamItem[] }>("/field/shifts/active", {
      params: { scope: "team" },
    } as never);
    return res.data;
  },

  getSamples: async (
    shiftId: string,
    opts?: { since?: string; limit?: number },
  ): Promise<{ items: FieldLocationSampleRow[]; hasMore: boolean }> => {
    const res = await apiHttp.get<{ items: FieldLocationSampleRow[]; hasMore: boolean }>(
      `/field/shifts/${shiftId}/samples`,
      { params: opts } as never,
    );
    return res.data;
  },

  getTrackGeometry: async (
    shiftId: string,
  ): Promise<FieldTrackGeometry> => {
    const res = await apiHttp.get<FieldTrackGeometry>(
      `/field/shifts/${shiftId}/track-geometry`,
    );
    return res.data;
  },
};
