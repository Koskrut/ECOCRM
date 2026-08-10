import AsyncStorage from "@react-native-async-storage/async-storage";

import type { TrackingMode } from "./location-tracking-health";

export const FIELD_SHIFT_SNAPSHOT_KEY = "field_shift_snapshot";

/** Minimal DTO for cold-wake / background task — not full FieldShift API object. */
export type FieldShiftSnapshot = {
  shiftId: string;
  status: "ACTIVE";
  trackingMode: TrackingMode;
  startedAt: string;
  lastKnownAcceptAt: string | null;
  lastKnownPointAt: string | null;
  employeeId?: string;
  persistedAt: string;
};

export type WriteShiftSnapshotInput = {
  shiftId: string;
  trackingMode: TrackingMode;
  startedAt?: string;
  lastKnownAcceptAt?: string | null;
  lastKnownPointAt?: string | null;
  employeeId?: string;
};

export async function readFieldShiftSnapshot(): Promise<FieldShiftSnapshot | null> {
  const raw = await AsyncStorage.getItem(FIELD_SHIFT_SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as FieldShiftSnapshot;
    if (parsed?.shiftId && parsed.status === "ACTIVE") return parsed;
  } catch {
    /* corrupt */
  }
  return null;
}

export async function writeFieldShiftSnapshot(input: WriteShiftSnapshotInput): Promise<void> {
  const existing = await readFieldShiftSnapshot();
  const now = new Date().toISOString();
  const snapshot: FieldShiftSnapshot = {
    shiftId: input.shiftId,
    status: "ACTIVE",
    trackingMode: input.trackingMode,
    startedAt: input.startedAt ?? existing?.startedAt ?? now,
    lastKnownAcceptAt:
      input.lastKnownAcceptAt !== undefined
        ? input.lastKnownAcceptAt
        : (existing?.lastKnownAcceptAt ?? null),
    lastKnownPointAt:
      input.lastKnownPointAt !== undefined
        ? input.lastKnownPointAt
        : (existing?.lastKnownPointAt ?? null),
    employeeId: input.employeeId ?? existing?.employeeId,
    persistedAt: now,
  };
  await AsyncStorage.setItem(FIELD_SHIFT_SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export async function patchFieldShiftSnapshot(
  patch: Partial<
    Pick<
      FieldShiftSnapshot,
      "lastKnownAcceptAt" | "lastKnownPointAt" | "trackingMode" | "employeeId"
    >
  >,
): Promise<void> {
  const existing = await readFieldShiftSnapshot();
  if (!existing) return;
  await writeFieldShiftSnapshot({
    shiftId: existing.shiftId,
    trackingMode: patch.trackingMode ?? existing.trackingMode,
    startedAt: existing.startedAt,
    lastKnownAcceptAt:
      patch.lastKnownAcceptAt !== undefined
        ? patch.lastKnownAcceptAt
        : existing.lastKnownAcceptAt,
    lastKnownPointAt:
      patch.lastKnownPointAt !== undefined
        ? patch.lastKnownPointAt
        : existing.lastKnownPointAt,
    employeeId: patch.employeeId ?? existing.employeeId,
  });
}

export async function clearFieldShiftSnapshot(): Promise<void> {
  await AsyncStorage.removeItem(FIELD_SHIFT_SNAPSHOT_KEY);
}

/** Resolve shift id: storage binding → persisted ACTIVE snapshot. */
export async function resolveShiftIdForAppend(storedShiftId: string | null): Promise<string | null> {
  if (storedShiftId) return storedShiftId;
  const snapshot = await readFieldShiftSnapshot();
  if (snapshot?.status === "ACTIVE") return snapshot.shiftId;
  return null;
}
