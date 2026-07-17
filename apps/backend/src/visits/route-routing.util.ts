import type { LatLng } from "./route-geometry";

/**
 * Max intermediate waypoints per OSRM route leg (overlap stitching via splitRouteLegs).
 * OSRM default allows ~100 coordinates; 90 leaves headroom.
 */
export const MAX_INTERMEDIATES_PER_LEG = 90;

export type RouteLeg = {
  origin: LatLng;
  destination: LatLng;
  intermediates: LatLng[];
};

/** Split origin → intermediates → destination into legs that fit Google waypoint limits (with overlap). */
export function splitRouteLegs(
  origin: LatLng,
  intermediates: LatLng[],
  destination: LatLng,
): RouteLeg[] {
  const chain: LatLng[] = [origin, ...intermediates, destination];
  if (chain.length < 2) {
    return [];
  }
  if (chain.length === 2) {
    return [{ origin: chain[0]!, destination: chain[1]!, intermediates: [] }];
  }

  const legs: RouteLeg[] = [];
  let i = 0;

  while (i < chain.length - 1) {
    const remaining = chain.length - 1 - i;
    if (remaining <= MAX_INTERMEDIATES_PER_LEG + 1) {
      legs.push({
        origin: chain[i]!,
        intermediates: chain.slice(i + 1, chain.length - 1),
        destination: chain[chain.length - 1]!,
      });
      break;
    }

    const legEnd = i + MAX_INTERMEDIATES_PER_LEG + 1;
    legs.push({
      origin: chain[i]!,
      intermediates: chain.slice(i + 1, legEnd),
      destination: chain[legEnd]!,
    });
    i = legEnd;
  }

  return legs;
}

/** Stitch decoded leg polylines, dropping duplicate stitch points. */
export function concatPaths(paths: LatLng[][]): LatLng[] {
  const out: LatLng[] = [];
  for (const path of paths) {
    for (const p of path) {
      const last = out[out.length - 1];
      if (!last || last.lat !== p.lat || last.lng !== p.lng) {
        out.push(p);
      }
    }
  }
  return out;
}

export function sumLegMetrics(
  legs: Array<{ distanceKm: number | null; durationMin: number | null }>,
): { distanceKm: number | null; durationMin: number | null } {
  let distanceKm = 0;
  let durationMin = 0;
  let hasDist = false;
  let hasDur = false;
  for (const leg of legs) {
    if (leg.distanceKm != null && Number.isFinite(leg.distanceKm)) {
      distanceKm += leg.distanceKm;
      hasDist = true;
    }
    if (leg.durationMin != null && Number.isFinite(leg.durationMin)) {
      durationMin += leg.durationMin;
      hasDur = true;
    }
  }
  return {
    distanceKm: hasDist ? Math.round(distanceKm * 10) / 10 : null,
    durationMin: hasDur ? durationMin : null,
  };
}

/** Minimum polyline length (km) to use GPS track for fuel compensation. */
export const MIN_TRACK_COMPENSATION_KM = 0.5;

/** Minimum filtered samples to use GPS track for fuel compensation. */
export const MIN_TRACK_COMPENSATION_SAMPLES = 2;

/**
 * Minimum share of shift span covered by GPS samples for payout on fact_gps.
 * Aligns UI low-coverage warnings with compensation policy.
 */
export const MIN_TRACK_COVERAGE_RATIO = 0.7;

/**
 * If the last GPS sample is earlier than the last DONE visit by more than this
 * many minutes, treat the track as truncated (background tracking died).
 */
export const TRACK_END_GRACE_MIN = 45;

export type TrackCompensationEligibility = {
  eligible: boolean;
  reason: string | null;
};

/** Whether a day's GPS track qualifies for payout (v2 policy). */
export function isTrackEligibleForCompensation(opts: {
  hasTrackingEnabledShift: boolean;
  filteredSampleCount: number;
  rawPolylineDistanceKm: number | null;
  /** 0–1 share of shift duration spanned by samples. */
  coverageRatio?: number | null;
  /** Timestamp of the last filtered GPS sample. */
  lastSampleAt?: Date | string | null;
  /** completedAt of the last DONE visit that day. */
  lastDoneVisitCompletedAt?: Date | string | null;
}): TrackCompensationEligibility {
  if (!opts.hasTrackingEnabledShift) {
    return { eligible: false, reason: "no_tracking_shift" };
  }
  if (opts.filteredSampleCount < MIN_TRACK_COMPENSATION_SAMPLES) {
    return { eligible: false, reason: "insufficient_gps_samples" };
  }
  if (
    opts.rawPolylineDistanceKm == null ||
    opts.rawPolylineDistanceKm < MIN_TRACK_COMPENSATION_KM
  ) {
    return { eligible: false, reason: "track_too_short" };
  }
  if (
    opts.coverageRatio != null &&
    Number.isFinite(opts.coverageRatio) &&
    opts.coverageRatio < MIN_TRACK_COVERAGE_RATIO
  ) {
    return { eligible: false, reason: "gps_low_coverage" };
  }

  const lastSampleMs = toTimeMs(opts.lastSampleAt);
  const lastDoneMs = toTimeMs(opts.lastDoneVisitCompletedAt);
  if (lastSampleMs != null && lastDoneMs != null) {
    const graceMs = TRACK_END_GRACE_MIN * 60_000;
    if (lastSampleMs < lastDoneMs - graceMs) {
      return { eligible: false, reason: "gps_ended_before_last_visit" };
    }
  }

  return { eligible: true, reason: null };
}

function toTimeMs(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

/** GPS track quality for UI warnings (partial coverage); not used for payout blocking. */
export function assessGpsTrackQuality(
  sampleCount: number,
  coverageRatio: number | null,
): {
  degraded: boolean;
  partialCoverage: boolean;
  lowCoverage: boolean;
  degradedReason: string | null;
} {
  const lowCoverage = coverageRatio != null && coverageRatio < MIN_TRACK_COVERAGE_RATIO;
  const partialCoverage = lowCoverage && sampleCount >= 50;
  const degraded = sampleCount < 10 || (lowCoverage && sampleCount < 50);

  let degradedReason: string | null = null;
  if (sampleCount < 10) {
    degradedReason = "insufficient_gps_samples";
  } else if (partialCoverage) {
    degradedReason = "gps_partial_coverage";
  } else if (lowCoverage) {
    degradedReason = "low_gps_coverage";
  }

  return { degraded, partialCoverage, lowCoverage, degradedReason };
}

/** Evenly downsample a path while keeping first and last points. */
export function downsamplePathUniform(path: LatLng[], maxPoints: number): LatLng[] {
  if (path.length <= maxPoints) return path;
  if (maxPoints < 2) return [path[0]!, path[path.length - 1]!];

  const out: LatLng[] = [path[0]!];
  const innerSlots = maxPoints - 2;
  const step = (path.length - 1) / (innerSlots + 1);
  for (let i = 1; i <= innerSlots; i++) {
    const idx = Math.min(path.length - 2, Math.round(i * step));
    const p = path[idx]!;
    const last = out[out.length - 1];
    if (!last || last.lat !== p.lat || last.lng !== p.lng) {
      out.push(p);
    }
  }
  const lastPt = path[path.length - 1]!;
  const tail = out[out.length - 1];
  if (!tail || tail.lat !== lastPt.lat || tail.lng !== lastPt.lng) {
    out.push(lastPt);
  }
  return out;
}
