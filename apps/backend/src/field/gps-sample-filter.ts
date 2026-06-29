import { haversineDistanceM } from "../visits/visit-gps.verification";

/** Max horizontal accuracy for shift track samples (stricter than visit check). */
export const TRACK_MAX_ACCURACY_M = 100;

/** Reject jumps implying faster travel than this (km/h). */
export const MAX_IMPLAUSIBLE_SPEED_KMH = 180;

/** Ignore consecutive samples closer than this in time (seconds). */
export const MIN_TIME_DELTA_S = 5;

export type GpsSamplePoint = {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  clientRecordedAt: Date | string;
};

export type FilterGpsSampleResult = {
  accept: boolean;
  reason?: "bad_accuracy" | "duplicate" | "teleport";
};

function toTimeMs(value: Date | string): number {
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(t) ? t : NaN;
}

export function filterGpsSample(
  prev: GpsSamplePoint | null | undefined,
  next: GpsSamplePoint,
): FilterGpsSampleResult {
  const acc = next.accuracyM;
  if (
    acc != null &&
    typeof acc === "number" &&
    Number.isFinite(acc) &&
    acc > TRACK_MAX_ACCURACY_M
  ) {
    return { accept: false, reason: "bad_accuracy" };
  }

  if (!prev) {
    return { accept: true };
  }

  const prevAt = toTimeMs(prev.clientRecordedAt);
  const nextAt = toTimeMs(next.clientRecordedAt);
  if (!Number.isFinite(prevAt) || !Number.isFinite(nextAt)) {
    return { accept: true };
  }

  const dtS = (nextAt - prevAt) / 1000;
  if (dtS >= 0 && dtS < MIN_TIME_DELTA_S) {
    return { accept: false, reason: "duplicate" };
  }

  if (dtS > 0) {
    const distM = haversineDistanceM(prev.lat, prev.lng, next.lat, next.lng);
    const speedKmh = (distM / 1000 / dtS) * 3600;
    if (speedKmh > MAX_IMPLAUSIBLE_SPEED_KMH) {
      return { accept: false, reason: "teleport" };
    }
  }

  return { accept: true };
}

export function filterGpsTrack<T extends GpsSamplePoint>(samples: T[]): T[] {
  const out: T[] = [];
  let prev: GpsSamplePoint | null = null;
  for (const s of samples) {
    const result = filterGpsSample(prev, s);
    if (result.accept) {
      out.push(s);
      prev = s;
    }
  }
  return out;
}
