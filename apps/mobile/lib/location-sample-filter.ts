import {
  MAX_IMPLAUSIBLE_SPEED_KMH,
  MIN_TIME_DELTA_S,
  TRACK_MAX_ACCURACY_M,
} from "./location-tracking-config";
import { haversineDistanceM } from "./geo-utils";

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
