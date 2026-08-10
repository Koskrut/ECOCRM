/** Keep in sync with apps/backend/src/field/gps-sample-filter.ts */
export const TRACK_MAX_ACCURACY_M = 150;
export const MAX_IMPLAUSIBLE_SPEED_KMH = 150;
export const MIN_DISTANCE_DEDUP_M = 15;

/** Accept a near-duplicate sample after this idle span (keepalive for coverage). */
export const KEEPALIVE_INTERVAL_MS = 3 * 60_000;

/**
 * After this gap, next in-UA sample reanchors (no teleport vs stale prev).
 * 15 min covers typical OEM FGS kill windows; keep in sync with backend gps-sample-filter.
 */
export const REANCHOR_GAP_MS = 15 * 60_000;

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
  /** True when accepted only because gap ≥ REANCHOR_GAP_MS. */
  reanchor?: boolean;
  gapMs?: number;
  distM?: number;
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
  const gapMs =
    Number.isFinite(prevAt) && Number.isFinite(nextAt) ? nextAt - prevAt : NaN;
  const distM = haversineDistanceM(prev.lat, prev.lng, next.lat, next.lng);

  // Long silence (FGS kill / minimize) → reanchor; do not treat as teleport.
  if (Number.isFinite(gapMs) && gapMs >= REANCHOR_GAP_MS) {
    return { accept: true, reanchor: true, gapMs, distM };
  }

  if (distM < MIN_DISTANCE_DEDUP_M) {
    if (Number.isFinite(gapMs) && gapMs >= KEEPALIVE_INTERVAL_MS) {
      return { accept: true, gapMs, distM };
    }
    return { accept: false, reason: "duplicate", gapMs, distM };
  }

  if (Number.isFinite(prevAt) && Number.isFinite(nextAt)) {
    const dtS = gapMs / 1000;
    if (dtS > 0) {
      const speedKmh = (distM / 1000 / dtS) * 3600;
      if (speedKmh > MAX_IMPLAUSIBLE_SPEED_KMH) {
        return { accept: false, reason: "teleport", gapMs, distM };
      }
    } else {
      // Same-ts / older-ts jump — match backend (would otherwise skip speed check).
      return { accept: false, reason: "teleport", gapMs, distM };
    }
  }

  return { accept: true, gapMs, distM };
}

/** Stable ascending time order before POST — matches backend sortGpsSamplesByTime. */
export function sortSamplesByTime<T extends { clientRecordedAt: string }>(samples: T[]): T[] {
  return [...samples].sort((a, b) => {
    const ta = new Date(a.clientRecordedAt).getTime();
    const tb = new Date(b.clientRecordedAt).getTime();
    const aOk = Number.isFinite(ta);
    const bOk = Number.isFinite(tb);
    if (!aOk && !bOk) return 0;
    if (!aOk) return 1;
    if (!bOk) return -1;
    return ta - tb;
  });
}

/** Warn line for client teleport reject — prev/next + gap for Gumenyuk triage. */
export function formatTeleportRejectLog(
  prev: LocationSampleInput,
  next: LocationSampleInput,
  gapMs?: number,
  distM?: number,
): string {
  const gapMin =
    gapMs != null && Number.isFinite(gapMs) ? (gapMs / 60_000).toFixed(1) : "?";
  const dist =
    distM != null && Number.isFinite(distM) ? distM.toFixed(0) : "?";
  return (
    `location sample skipped: teleport after gap` +
    ` gapMin=${gapMin} distM=${dist}` +
    ` prev=${prev.lat.toFixed(5)},${prev.lng.toFixed(5)}` +
    ` next=${next.lat.toFixed(5)},${next.lng.toFixed(5)}`
  );
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
