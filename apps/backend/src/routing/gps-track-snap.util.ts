import type { LatLng } from "../visits/route-geometry";
import { haversineDistanceM } from "../visits/visit-gps.verification";
import { concatPaths } from "../visits/route-routing.util";

/** Split filtered GPS samples before OSRM /match when gap exceeds this (minutes). */
export const TRACK_SEGMENT_GAP_MIN = 30;

/** Endpoints within this distance (km) on a long trip suggest a loop day (home→…→home). */
export const LOOP_ENDPOINT_NEAR_KM = 2;

/** Minimum trip extent (km) before loop-endpoint heuristic applies. */
export const LOOP_MIN_TRIP_KM = 30;

/** Snapped km below this fraction of simplified track → loop collapse / bad match. */
export const LOOP_SNAP_VS_SIMPLIFIED_RATIO = 0.25;

/** Insert road legs between path vertices when straight gap exceeds this (km). */
export const STITCH_GAP_THRESHOLD_KM = 0.3;

/** Mark quality degraded when a straight segment remains above this after stitch (km). */
export const STITCH_GAP_DEGRADED_KM = 1;

export type TrackedGpsSample = LatLng & { clientRecordedAt: Date | string };

export type StitchPathResult = {
  path: LatLng[];
  maxStitchGapKm: number;
  hasUnfilledGaps: boolean;
};

export function haversineKm(a: LatLng, b: LatLng): number {
  return haversineDistanceM(a.lat, a.lng, b.lat, b.lng) / 1000;
}

/** Sum of haversine legs along a polyline (km). */
export function pathDistanceKm(path: LatLng[]): number | null {
  if (path.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < path.length; i++) {
    sum += haversineKm(path[i - 1]!, path[i]!);
  }
  return Math.round(sum * 10) / 10;
}

/** Bounding-box diagonal span (km) — coarse trip extent for loop detection. */
export function bboxDiagonalKm(path: LatLng[]): number {
  if (path.length < 2) return 0;
  let minLat = path[0]!.lat;
  let maxLat = path[0]!.lat;
  let minLng = path[0]!.lng;
  let maxLng = path[0]!.lng;
  for (const p of path) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  return haversineKm({ lat: minLat, lng: minLng }, { lat: maxLat, lng: maxLng });
}

/**
 * Loop day: start≈end but trip extent is large (Mykhailiv 29.07 symptom).
 * Uses simplified/downsampled path km when provided to ignore parking jitter.
 */
export function isLoopTripSuspicious(opts: {
  first: LatLng;
  last: LatLng;
  rawPolylineDistanceKm?: number | null;
  simplifiedPathDistanceKm?: number | null;
  bboxDiagonalKm?: number | null;
}): boolean {
  const endpointKm = haversineKm(opts.first, opts.last);
  if (endpointKm > LOOP_ENDPOINT_NEAR_KM) return false;

  const extent =
    opts.simplifiedPathDistanceKm ??
    opts.rawPolylineDistanceKm ??
    opts.bboxDiagonalKm ??
    0;
  return extent >= LOOP_MIN_TRIP_KM;
}

/** True when OSRM snap is tiny vs trip extent on a suspected loop day. */
export function isLoopSnapCollapsed(opts: {
  snappedDistanceKm: number | null;
  simplifiedPathDistanceKm: number | null;
  loopSuspicious: boolean;
}): boolean {
  if (!opts.loopSuspicious) return false;
  const snapped = opts.snappedDistanceKm;
  const simplified = opts.simplifiedPathDistanceKm;
  if (snapped == null || simplified == null || simplified < LOOP_MIN_TRIP_KM) return false;
  return snapped < simplified * LOOP_SNAP_VS_SIMPLIFIED_RATIO;
}

/** Largest straight-line span between consecutive polyline vertices (km). */
export function maxStraightSegmentKm(path: LatLng[]): number {
  if (path.length < 2) return 0;
  let max = 0;
  for (let i = 1; i < path.length; i++) {
    max = Math.max(max, haversineKm(path[i - 1]!, path[i]!));
  }
  return Math.round(max * 100) / 100;
}

export function splitSamplesByTimeGap<T extends { clientRecordedAt: Date | string }>(
  samples: T[],
  gapMin = TRACK_SEGMENT_GAP_MIN,
): T[][] {
  if (samples.length === 0) return [];
  const gapMs = gapMin * 60_000;
  const chunks: T[][] = [[samples[0]!]];
  for (let i = 1; i < samples.length; i++) {
    const prevT = new Date(samples[i - 1]!.clientRecordedAt).getTime();
    const curT = new Date(samples[i]!.clientRecordedAt).getTime();
    if (Number.isFinite(prevT) && Number.isFinite(curT) && curT - prevT > gapMs) {
      chunks.push([samples[i]!]);
    } else {
      chunks[chunks.length - 1]!.push(samples[i]!);
    }
  }
  return chunks;
}

/**
 * Fill straight gaps between path vertices with OSRM route legs (A→B).
 * Leaves unfilled gaps when routing fails and marks hasUnfilledGaps when any span > 1 km.
 */
export async function stitchPathGaps(
  path: LatLng[],
  routeLeg: (origin: LatLng, destination: LatLng) => Promise<{ path: LatLng[] } | null>,
  thresholdKm = STITCH_GAP_THRESHOLD_KM,
): Promise<StitchPathResult> {
  if (path.length < 2) {
    return { path, maxStitchGapKm: 0, hasUnfilledGaps: false };
  }

  const stitched: LatLng[][] = [[path[0]!]];

  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1]!;
    const next = path[i]!;
    const gapKm = haversineKm(prev, next);

    if (gapKm > thresholdKm) {
      const leg = await routeLeg(prev, next);
      if (leg?.path && leg.path.length >= 2) {
        stitched.push(leg.path);
      } else {
        stitched.push([next]);
      }
    } else {
      const tail = stitched[stitched.length - 1]!;
      const last = tail[tail.length - 1];
      if (!last || last.lat !== next.lat || last.lng !== next.lng) {
        tail.push(next);
      }
    }
  }

  const out = concatPaths(stitched);
  const maxStitchGapKm = maxStraightSegmentKm(out);
  const hasUnfilledGaps = maxStitchGapKm > STITCH_GAP_DEGRADED_KM;
  return { path: out, maxStitchGapKm, hasUnfilledGaps };
}

/** Normalize legacy LatLng[] input (1 min apart) for callers without timestamps. */
export function asTrackedSamples(input: LatLng[] | TrackedGpsSample[]): TrackedGpsSample[] {
  if (input.length === 0) return [];
  const first = input[0] as TrackedGpsSample;
  if (first.clientRecordedAt != null) {
    return input as TrackedGpsSample[];
  }
  const base = Date.now();
  return (input as LatLng[]).map((p, i) => ({
    ...p,
    clientRecordedAt: new Date(base + i * 60_000),
  }));
}
