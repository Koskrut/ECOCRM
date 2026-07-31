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

/** Accept a near-duplicate sample after this idle span (keepalive for coverage). */
export const KEEPALIVE_INTERVAL_MS = 3 * 60_000;

/**
 * Approximate Ukraine field-ops bounding box (lat/lng).
 * Covers mainland UA; rejects emulator mocks (e.g. Lima −12, −77).
 */
export const UA_FIELD_LAT_MIN = 44;
export const UA_FIELD_LAT_MAX = 53;
export const UA_FIELD_LNG_MIN = 22;
export const UA_FIELD_LNG_MAX = 41;

/** Consecutive teleport candidates that cluster together → reanchor prev. */
export const REANCHOR_MIN_CLUSTER = 3;

/** Max pairwise distance (m) among reanchor cluster members. */
export const REANCHOR_MAX_SPREAD_M = 2_000;

export type GpsSamplePoint = {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  clientRecordedAt: Date | string;
};

export type FilterGpsSampleReason =
  | "bad_accuracy"
  | "duplicate"
  | "teleport"
  | "out_of_region";

export type FilterGpsSampleResult = {
  accept: boolean;
  reason?: FilterGpsSampleReason;
  /** Accepted after discarding a teleport cluster far from previous prev. */
  reanchor?: boolean;
};

export type SanitizeGpsTrackResult<T extends GpsSamplePoint> = {
  samples: T[];
  droppedReasons: Record<string, number>;
  reanchorUsed: boolean;
  filteredSampleCount: number;
};

function toTimeMs(value: Date | string): number {
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(t) ? t : NaN;
}

export function isInUaFieldRegion(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= UA_FIELD_LAT_MIN &&
    lat <= UA_FIELD_LAT_MAX &&
    lng >= UA_FIELD_LNG_MIN &&
    lng <= UA_FIELD_LNG_MAX
  );
}

function bumpReason(reasons: Record<string, number>, reason: string): void {
  reasons[reason] = (reasons[reason] ?? 0) + 1;
}

function clusterIsConsistent(cluster: GpsSamplePoint[]): boolean {
  if (cluster.length < REANCHOR_MIN_CLUSTER) return false;
  const window = cluster.slice(-REANCHOR_MIN_CLUSTER);
  for (let i = 0; i < window.length; i++) {
    for (let j = i + 1; j < window.length; j++) {
      const a = window[i]!;
      const b = window[j]!;
      if (haversineDistanceM(a.lat, a.lng, b.lat, b.lng) > REANCHOR_MAX_SPREAD_M) {
        return false;
      }
    }
  }
  return window.every((p) => isInUaFieldRegion(p.lat, p.lng));
}

/**
 * Pure relative filter (accuracy / dedup / teleport). Geo allowlist is applied by
 * {@link GpsTrackFilterSession} / {@link filterGpsSample} wrappers.
 */
export function filterGpsSampleRelative(
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
    } else {
      // Same-ts / older-ts jump would otherwise skip the speed check and inflate km.
      return { accept: false, reason: "teleport" };
    }
  }

  return { accept: true };
}

/** Stateless single-sample check including UA geo allowlist (no reanchor). */
export function filterGpsSample(
  prev: GpsSamplePoint | null | undefined,
  next: GpsSamplePoint,
): FilterGpsSampleResult {
  if (!isInUaFieldRegion(next.lat, next.lng)) {
    return { accept: false, reason: "out_of_region" };
  }
  return filterGpsSampleRelative(prev, next);
}

/**
 * Stateful append/read filter: geo → relative → teleport reanchor.
 * Rejected teleports do not poison the day; a consistent distant cluster reanchors prev.
 */
export class GpsTrackFilterSession {
  private prev: GpsSamplePoint | null;
  private pendingTeleports: GpsSamplePoint[] = [];
  private reanchorUsedFlag = false;
  private readonly droppedReasons: Record<string, number> = {};

  constructor(prev: GpsSamplePoint | null | undefined = null) {
    this.prev =
      prev && isInUaFieldRegion(prev.lat, prev.lng)
        ? {
            lat: prev.lat,
            lng: prev.lng,
            accuracyM: prev.accuracyM,
            clientRecordedAt: prev.clientRecordedAt,
          }
        : null;
  }

  get prevSample(): GpsSamplePoint | null {
    return this.prev;
  }

  get reanchorUsed(): boolean {
    return this.reanchorUsedFlag;
  }

  getDroppedReasons(): Record<string, number> {
    return { ...this.droppedReasons };
  }

  /** Record points dropped when reanchor clears the prior segment (read/sanitize). */
  noteReanchorTrim(count: number): void {
    if (count > 0) {
      this.droppedReasons.reanchor_trim = (this.droppedReasons.reanchor_trim ?? 0) + count;
    }
  }

  consider(next: GpsSamplePoint): FilterGpsSampleResult {
    if (!isInUaFieldRegion(next.lat, next.lng)) {
      bumpReason(this.droppedReasons, "out_of_region");
      return { accept: false, reason: "out_of_region" };
    }

    const verdict = filterGpsSampleRelative(this.prev, next);
    if (verdict.accept) {
      this.prev = next;
      this.pendingTeleports = [];
      return verdict;
    }

    if (verdict.reason === "teleport") {
      this.pendingTeleports.push(next);
      // Bound memory: keep only a short window for cluster detection.
      if (this.pendingTeleports.length > REANCHOR_MIN_CLUSTER * 4) {
        this.pendingTeleports = this.pendingTeleports.slice(-REANCHOR_MIN_CLUSTER * 2);
      }
      if (clusterIsConsistent(this.pendingTeleports)) {
        this.prev = next;
        this.pendingTeleports = [];
        this.reanchorUsedFlag = true;
        return { accept: true, reanchor: true };
      }
      bumpReason(this.droppedReasons, "teleport");
      return { accept: false, reason: "teleport" };
    }

    const reason = verdict.reason ?? "unknown";
    bumpReason(this.droppedReasons, reason);
    return verdict;
  }
}

/** Stable ascending sort before appendSamples filter chain. */
export function sortGpsSamplesByTime<T extends GpsSamplePoint>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => toTimeMs(a.clientRecordedAt) - toTimeMs(b.clientRecordedAt),
  );
}

/** Sanitize track for display / fuel: geo drop + relative filter + reanchor. */
export function sanitizeGpsTrack<T extends GpsSamplePoint>(
  samples: T[],
): SanitizeGpsTrackResult<T> {
  const session = new GpsTrackFilterSession(null);
  const out: T[] = [];
  for (const s of sortGpsSamplesByTime(samples)) {
    const result = session.consider(s);
    if (result.accept) {
      // Reanchor starts a new segment — drop pre-jump points so path/fuel
      // don't draw Kyiv→Odessa (~400+ km) or stitch across the country.
      if (result.reanchor && out.length > 0) {
        session.noteReanchorTrim(out.length);
        out.length = 0;
      }
      out.push(s);
    }
  }
  return {
    samples: out,
    droppedReasons: session.getDroppedReasons(),
    reanchorUsed: session.reanchorUsed,
    filteredSampleCount: out.length,
  };
}

/** Back-compat: filtered samples only (geo + reanchor + relative). */
export function filterGpsTrack<T extends GpsSamplePoint>(samples: T[]): T[] {
  return sanitizeGpsTrack(samples).samples;
}

/** Last sample inside UA field bbox (desc by clientRecordedAt). */
export function lastInRegionSample<T extends GpsSamplePoint>(
  samples: T[],
): T | null {
  let best: T | null = null;
  let bestMs = -Infinity;
  for (const s of samples) {
    if (!isInUaFieldRegion(s.lat, s.lng)) continue;
    const ms = toTimeMs(s.clientRecordedAt);
    if (Number.isFinite(ms) && ms >= bestMs) {
      best = s;
      bestMs = ms;
    }
  }
  return best;
}
