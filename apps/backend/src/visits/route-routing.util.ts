import {
  LOOP_MIN_TRIP_KM,
  LOOP_SNAP_VS_SIMPLIFIED_RATIO,
} from "../routing/gps-track-snap.util";
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

/**
 * If snapped GPS km is below this fraction of the visits route (with enough
 * visit km), treat the track as truncated/broken match → pay by visits.
 * Guards against OSRM /match returning only the first gap segment.
 * Visit route includes return anchor, so real GPS is often ~50–65% of visit km.
 */
export const TRACK_VS_VISITS_SANITY_RATIO = 0.55;

/** Minimum visit-route km before the track-vs-visits sanity check applies. */
export const MIN_VISIT_ROUTE_KM_FOR_SANITY = 2;

/**
 * If snapped GPS km exceeds this multiple of the visits route (with enough visit km),
 * treat as inflated fallback-route / jitter → pay by visits.
 */
export const TRACK_VS_VISITS_MAX_RATIO = 1.35;

/** Minimum visit-route km before the max-ratio sanity check applies. */
export const MIN_VISIT_ROUTE_KM_FOR_MAX_SANITY = 2;

export type TrackCompensationEligibility = {
  eligible: boolean;
  reason: string | null;
};

export type TrackCompensationInput = {
  hasTrackingEnabledShift: boolean;
  filteredSampleCount: number;
  rawPolylineDistanceKm: number | null;
  /** 0–1 share of shift duration spanned by samples. */
  coverageRatio?: number | null;
  /** Timestamp of the last filtered GPS sample. */
  lastSampleAt?: Date | string | null;
  /** completedAt of the last DONE visit that day. */
  lastDoneVisitCompletedAt?: Date | string | null;
  /**
   * Road-snapped GPS distance used for payout (OSRM match sum).
   * Compared to visitRouteDistanceKm when coverage is healthy.
   */
  snappedTrackDistanceKm?: number | null;
  /** fact_visits OSRM distance for the same day. */
  visitRouteDistanceKm?: number | null;
  /** Set when road snap failed (loop collapse, etc.). */
  snapFailureReason?: string | null;
  /** Planned km warning from assessPlannedKm. */
  plannedKmWarning?: string | null;
};

/** Whether a day's GPS track qualifies for payout (v2 policy). */
export function isTrackEligibleForCompensation(
  opts: TrackCompensationInput,
): TrackCompensationEligibility {
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

  if (isGpsImplausiblyShortVsVisits({
    coverageRatio: opts.coverageRatio,
    snappedTrackDistanceKm: opts.snappedTrackDistanceKm,
    visitRouteDistanceKm: opts.visitRouteDistanceKm,
    rawPolylineDistanceKm: opts.rawPolylineDistanceKm,
  })) {
    return { eligible: false, reason: "gps_implausibly_short_vs_visits" };
  }

  if (isGpsImplausiblyLongVsVisits({
    coverageRatio: opts.coverageRatio,
    snappedTrackDistanceKm: opts.snappedTrackDistanceKm,
    visitRouteDistanceKm: opts.visitRouteDistanceKm,
  })) {
    return { eligible: false, reason: "gps_implausibly_long_vs_visits" };
  }

  return { eligible: true, reason: null };
}

/** Soft reasons: track is usable for payout when visits cannot pay (Hrybovska-like). */
const GPS_SOFT_INELIGIBLE = new Set([
  "gps_low_coverage",
  "gps_ended_before_last_visit",
]);

/** Best usable GPS km for compensation — OSRM snapped only (never raw haversine). */
export function resolveUsableGpsKm(opts: {
  snappedTrackDistanceKm?: number | null;
  rawPolylineDistanceKm?: number | null;
}): number | null {
  const snapped = opts.snappedTrackDistanceKm;
  if (snapped != null && Number.isFinite(snapped) && snapped >= MIN_TRACK_COMPENSATION_KM) {
    return snapped;
  }
  return null;
}

function trackKmUsable(opts: TrackCompensationInput): boolean {
  if (!opts.hasTrackingEnabledShift) return false;
  if (opts.filteredSampleCount < MIN_TRACK_COMPENSATION_SAMPLES) return false;
  // Tiny/failed OSRM snap must not block soft payout when raw polyline is usable.
  return resolveUsableGpsKm(opts) != null;
}

function visitsKmUsable(visitRouteDistanceKm: number | null | undefined): boolean {
  return (
    visitRouteDistanceKm != null &&
    Number.isFinite(visitRouteDistanceKm) &&
    visitRouteDistanceKm >= MIN_TRACK_COMPENSATION_KM
  );
}

export type CompensationFactSelection = {
  kind: "fact_gps" | "fact_visits" | "fact_visits_gps" | "none";
  /** Set when kind is fact_visits due to GPS ineligibility, or none for manual review. */
  ineligibleReason: string | null;
  /** Soft GPS issues that still allow fact_gps payout. */
  warnings: string[];
};

/**
 * Pick payout source. Soft GPS failures (low coverage / ended early) still pay
 * fact_gps when visits cannot (no/too-short visit route) — Hrybovska 31.07.
 * When visits can pay, keep falling back to fact_visits (Gumenyuk).
 */
export function selectCompensationFactKind(
  opts: TrackCompensationInput & {
    factVisitsGpsDistanceKm?: number | null;
  },
): CompensationFactSelection {
  if (opts.snapFailureReason === "gps_snap_loop_collapse") {
    return {
      kind: "none",
      ineligibleReason: "gps_snap_loop_collapse",
      warnings: ["gps_snap_loop_collapse"],
    };
  }

  const eligibility = isTrackEligibleForCompensation(opts);
  if (eligibility.eligible) {
    return { kind: "fact_gps", ineligibleReason: null, warnings: [] };
  }

  const reason = eligibility.reason;

  if (
    reason === "gps_implausibly_short_vs_visits" &&
    opts.rawPolylineDistanceKm != null &&
    opts.rawPolylineDistanceKm >= LOOP_MIN_TRIP_KM &&
    opts.snappedTrackDistanceKm != null &&
    opts.snappedTrackDistanceKm < opts.rawPolylineDistanceKm * LOOP_SNAP_VS_SIMPLIFIED_RATIO
  ) {
    return {
      kind: "none",
      ineligibleReason: "gps_snap_loop_collapse",
      warnings: ["gps_snap_loop_collapse"],
    };
  }

  const trackOk = trackKmUsable(opts);
  const visitsOk = visitsKmUsable(opts.visitRouteDistanceKm);
  const hybridKm = opts.factVisitsGpsDistanceKm;
  const hybridOk =
    hybridKm != null && Number.isFinite(hybridKm) && hybridKm >= MIN_TRACK_COMPENSATION_KM;

  if (hybridOk && trackOk && reason != null && GPS_SOFT_INELIGIBLE.has(reason)) {
    return { kind: "fact_visits_gps", ineligibleReason: null, warnings: [reason] };
  }

  if (trackOk && reason != null && GPS_SOFT_INELIGIBLE.has(reason) && !visitsOk) {
    const warnings = [reason];
    if (reason === "gps_low_coverage") {
      warnings.push("gps_partial_coverage");
    }
    return { kind: "fact_gps", ineligibleReason: null, warnings };
  }

  if (
    trackOk &&
    visitsOk &&
    reason != null &&
    GPS_SOFT_INELIGIBLE.has(reason)
  ) {
    const gpsKm = resolveUsableGpsKm(opts) ?? 0;
    if (gpsKm >= (opts.visitRouteDistanceKm ?? 0)) {
      const warnings = [reason];
      if (reason === "gps_low_coverage") {
        warnings.push("gps_partial_coverage");
      }
      return { kind: "fact_gps", ineligibleReason: null, warnings };
    }
  }

  return {
    kind: "fact_visits",
    ineligibleReason: reason,
    warnings: [],
  };
}

/** Planned km above this (or > 3× fact) is treated as garbage plan (Bondarenko). */
export const MAX_SANE_PLANNED_KM = 500;
export const PLANNED_VS_FACT_MAX_RATIO = 3;

export function assessPlannedKm(opts: {
  plannedKm: number | null | undefined;
  factKm: number | null | undefined;
}): { plannedKm: number | null; degraded: boolean; warning: string | null } {
  const planned = opts.plannedKm;
  if (planned == null || !Number.isFinite(planned)) {
    return { plannedKm: null, degraded: false, warning: null };
  }
  if (planned > MAX_SANE_PLANNED_KM) {
    return { plannedKm: planned, degraded: true, warning: "planned_km_implausibly_large" };
  }
  const fact = opts.factKm;
  if (
    fact != null &&
    Number.isFinite(fact) &&
    fact >= MIN_TRACK_COMPENSATION_KM &&
    planned > fact * PLANNED_VS_FACT_MAX_RATIO
  ) {
    return { plannedKm: planned, degraded: true, warning: "planned_km_vs_fact_outlier" };
  }
  return { plannedKm: planned, degraded: false, warning: null };
}

/**
 * True when snapped GPS km is far below the visits route despite healthy coverage
 * (classic symptom of truncated OSRM /match or a dead tracking buffer).
 */
export function isGpsImplausiblyShortVsVisits(opts: {
  coverageRatio?: number | null;
  snappedTrackDistanceKm?: number | null;
  visitRouteDistanceKm?: number | null;
  rawPolylineDistanceKm?: number | null;
}): boolean {
  const coverage = opts.coverageRatio;
  const trackKm = opts.snappedTrackDistanceKm;
  const visitKm = opts.visitRouteDistanceKm;
  const rawKm = opts.rawPolylineDistanceKm;
  if (coverage == null || !Number.isFinite(coverage) || coverage < MIN_TRACK_COVERAGE_RATIO) {
    return false;
  }
  // Near-zero snapped with a real raw track → truncated match (even if visit route < 2 km).
  // Only when snapped distance was explicitly computed (not omitted).
  if (
    trackKm != null &&
    Number.isFinite(trackKm) &&
    trackKm < MIN_TRACK_COMPENSATION_KM &&
    rawKm != null &&
    Number.isFinite(rawKm) &&
    rawKm >= MIN_TRACK_COMPENSATION_KM
  ) {
    return true;
  }

  if (visitKm == null || !Number.isFinite(visitKm) || visitKm < MIN_VISIT_ROUTE_KM_FOR_SANITY) {
    return false;
  }
  const effectiveTrack =
    trackKm != null && Number.isFinite(trackKm) ? Math.max(0, trackKm) : 0;
  return effectiveTrack < visitKm * TRACK_VS_VISITS_SANITY_RATIO;
}

/**
 * True when snapped GPS km is far above the visits route despite healthy coverage
 * (symptom of fallback routing through jitter waypoints or dense polyline sum).
 */
export function isGpsImplausiblyLongVsVisits(opts: {
  coverageRatio?: number | null;
  snappedTrackDistanceKm?: number | null;
  visitRouteDistanceKm?: number | null;
}): boolean {
  const coverage = opts.coverageRatio;
  const trackKm = opts.snappedTrackDistanceKm;
  const visitKm = opts.visitRouteDistanceKm;
  if (coverage == null || !Number.isFinite(coverage) || coverage < MIN_TRACK_COVERAGE_RATIO) {
    return false;
  }
  if (
    visitKm == null ||
    !Number.isFinite(visitKm) ||
    visitKm < MIN_VISIT_ROUTE_KM_FOR_MAX_SANITY
  ) {
    return false;
  }
  if (trackKm == null || !Number.isFinite(trackKm)) {
    return false;
  }
  return trackKm > visitKm * TRACK_VS_VISITS_MAX_RATIO;
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
