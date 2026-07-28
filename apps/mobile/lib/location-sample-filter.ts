/** Keep in sync with apps/backend/src/field/gps-sample-filter.ts */
export const TRACK_MAX_ACCURACY_M = 150;
export const MAX_IMPLAUSIBLE_SPEED_KMH = 150;
export const MIN_DISTANCE_DEDUP_M = 15;

/** Accept a near-duplicate sample after this idle span (keepalive for coverage). */
export const KEEPALIVE_INTERVAL_MS = 3 * 60_000;

function haversineDistanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLng - aLng);
  const φ1 = toRad(aLat);
  const φ2 = toRad(bLat);
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export type LocationSampleInput = {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  clientRecordedAt: string;
};

export type FilterLocationSampleResult = {
  accept: boolean;
  reason?: "bad_accuracy" | "duplicate" | "teleport";
};

function toTimeMs(value: string): number {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : NaN;
}

export function filterLocationSample(
  prev: LocationSampleInput | null | undefined,
  next: LocationSampleInput,
): FilterLocationSampleResult {
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
  const distM = haversineDistanceM(prev.lat, prev.lng, next.lat, next.lng);
  if (distM < MIN_DISTANCE_DEDUP_M) {
    if (
      Number.isFinite(prevAt) &&
      Number.isFinite(nextAt) &&
      nextAt - prevAt >= KEEPALIVE_INTERVAL_MS
    ) {
      return { accept: true };
    }
    return { accept: false, reason: "duplicate" };
  }

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

export function speedKmhBetween(
  prev: LocationSampleInput,
  next: LocationSampleInput,
): number | null {
  const prevAt = toTimeMs(prev.clientRecordedAt);
  const nextAt = toTimeMs(next.clientRecordedAt);
  if (!Number.isFinite(prevAt) || !Number.isFinite(nextAt)) return null;
  const dtS = (nextAt - prevAt) / 1000;
  if (dtS <= 0) return null;
  const distM = haversineDistanceM(prev.lat, prev.lng, next.lat, next.lng);
  return (distM / 1000 / dtS) * 3600;
}
