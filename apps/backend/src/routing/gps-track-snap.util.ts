import type { LatLng } from "../visits/route-geometry";
import { haversineDistanceM } from "../visits/visit-gps.verification";
import { concatPaths, downsamplePathUniform } from "../visits/route-routing.util";

/** Split filtered GPS samples before OSRM /match when gap exceeds this (minutes). */
export const TRACK_SEGMENT_GAP_MIN = 30;

/** Endpoints within this distance (km) on a long trip suggest a loop day (home→…→home). */
export const LOOP_ENDPOINT_NEAR_KM = 2;

/** Minimum trip extent (km) before loop-endpoint heuristic applies. */
export const LOOP_MIN_TRIP_KM = 30;

/** Snapped km below this fraction of simplified track → loop collapse / bad match. */
export const LOOP_SNAP_VS_SIMPLIFIED_RATIO = 0.25;

/** Map polyline haversine sum above this × snapped km → path/display bug (backtrack duplicates). */
export const PATH_VS_SNAPPED_MAX_RATIO = 1.35;

/** Legs at or above this length (km) are deduped when endpoints repeat (stitch hop bug). */
export const DEDUPE_MIN_LEG_KM = 0.5;

/** Max points per OSRM match chunk on the map (avoids jitter backtrack visually). */
export const DISPLAY_PATH_MAX_POINTS_PER_CHUNK = 80;

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

/** True when vertex-sum polyline length far exceeds payable OSRM km (Bondarenko path bug). */
export function isPathDistanceInconsistent(
  path: LatLng[],
  snappedDistanceKm: number | null,
  ratio = PATH_VS_SNAPPED_MAX_RATIO,
): boolean {
  if (snappedDistanceKm == null || snappedDistanceKm < 0.5) return false;
  const polyKm = pathDistanceKm(path);
  if (polyKm == null) return false;
  return polyKm > snappedDistanceKm * ratio;
}

function coordKey(p: LatLng, decimals = 4): string {
  const f = 10 ** decimals;
  return `${Math.round(p.lat * f) / f},${Math.round(p.lng * f) / f}`;
}

/**
 * Drop repeated long hops (A→B→A→B from duplicate stitch legs).
 * Bondarenko 2026-08-05: ~94 km polyline vs 15.6 km OSRM match sum.
 */
export function dedupeRepeatedPathLegs(
  path: LatLng[],
  minLegKm = DEDUPE_MIN_LEG_KM,
): LatLng[] {
  if (path.length < 2) return path;
  const out: LatLng[] = [path[0]!];
  const seenLongLegs = new Set<string>();

  for (let i = 1; i < path.length; i++) {
    const prev = out[out.length - 1]!;
    const next = path[i]!;
    const legKm = haversineKm(prev, next);
    if (legKm >= minLegKm) {
      const a = coordKey(prev);
      const b = coordKey(next);
      const undirected = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seenLongLegs.has(undirected)) {
        continue;
      }
      seenLongLegs.add(undirected);
    }
    const last = out[out.length - 1];
    if (!last || last.lat !== next.lat || last.lng !== next.lng) {
      out.push(next);
    }
  }
  return out;
}

export type ReconcileSnapPathResult = {
  path: LatLng[];
  pathDistanceMismatch: boolean;
  displayPathPolylineKm: number | null;
};

/** Dedupe display path; omit polyline when it still disagrees with payable OSRM km. */
export function reconcileSnapPathDisplay(
  path: LatLng[],
  osrmDistanceKm: number | null,
): ReconcileSnapPathResult {
  let cleaned = dedupeRepeatedPathLegs(path);
  let displayPathPolylineKm = pathDistanceKm(cleaned);
  let pathDistanceMismatch = isPathDistanceInconsistent(cleaned, osrmDistanceKm);

  if (pathDistanceMismatch) {
    cleaned = dedupeRepeatedPathLegs(path, 1.0);
    displayPathPolylineKm = pathDistanceKm(cleaned);
    pathDistanceMismatch = isPathDistanceInconsistent(cleaned, osrmDistanceKm);
  }

  if (pathDistanceMismatch) {
    return {
      path: [],
      pathDistanceMismatch: true,
      displayPathPolylineKm,
    };
  }

  return {
    path: cleaned.length >= 2 ? cleaned : path,
    pathDistanceMismatch: false,
    displayPathPolylineKm,
  };
}

/** Concat chunk + bridge paths for map display (no inner stitch on dense match polylines). */
export function mergeSnapPathsForDisplay(
  chunkPaths: LatLng[][],
  bridgePaths: LatLng[][],
  maxPointsPerChunk = DISPLAY_PATH_MAX_POINTS_PER_CHUNK,
): LatLng[] {
  const parts: LatLng[][] = [];
  for (let i = 0; i < chunkPaths.length; i++) {
    const cp = chunkPaths[i]!;
    if (cp.length >= 2) {
      parts.push(
        cp.length <= maxPointsPerChunk ? cp : downsamplePathUniform(cp, maxPointsPerChunk),
      );
    }
    const bridge = bridgePaths[i];
    if (bridge && bridge.length >= 2) {
      parts.push(bridge);
    }
  }
  return concatPaths(parts);
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
