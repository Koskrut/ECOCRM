import {
  VISIT_GPS_MAX_ACCURACY_M,
  haversineDistanceM,
} from "../visits/visit-gps.verification";

/** Max horizontal accuracy for shift track samples (same as visit GPS policy). */
export const TRACK_MAX_ACCURACY_M = VISIT_GPS_MAX_ACCURACY_M;

/** Reject jumps implying faster travel than this (km/h). */
export const MAX_IMPLAUSIBLE_SPEED_KMH = 150;

/** Skip consecutive samples closer than this (metres). */
export const MIN_DISTANCE_DEDUP_M = 15;

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

  const distM = haversineDistanceM(prev.lat, prev.lng, next.lat, next.lng);
  if (distM < MIN_DISTANCE_DEDUP_M) {
    return { accept: false, reason: "duplicate" };
  }

  const prevAt = toTimeMs(prev.clientRecordedAt);
  const nextAt = toTimeMs(next.clientRecordedAt);
  if (Number.isFinite(prevAt) && Number.isFinite(nextAt)) {
    const dtS = (nextAt - prevAt) / 1000;
    if (dtS > 0) {
      const speedKmh = (distM / 1000 / dtS) * 3600;
      if (speedKmh > MAX_IMPLAUSIBLE_SPEED_KMH) {
        return { accept: false, reason: "teleport" };
      }
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
