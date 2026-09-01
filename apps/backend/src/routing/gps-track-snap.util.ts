import type { LatLng } from "../visits/route-geometry";
import { haversineDistanceM } from "../visits/visit-gps.verification";
import { concatPaths, downsamplePathUniform } from "../visits/route-routing.util";

/** Split filtered GPS samples before OSRM /match when gap exceeds this (minutes). */
export const TRACK_SEGMENT_GAP_MIN = 30;

/** Endpoints within this distance (km) on a long trip suggest a loop day (home→…→home). */
export const LOOP_ENDPOINT_NEAR_KM = 2;

/** Minimum trip extent (km) before loop-endpoint heuristic applies. */
export const LOOP_MIN_TRIP_KM = 30;

/** Snapped km below this fraction of simplified track → tiny / collapsed match. */
export const LOOP_SNAP_VS_SIMPLIFIED_RATIO = 0.25;

/** Half-loop / post-split collapse: snapped below this × simplified (or visit-route km). */
export const LOOP_SNAP_HALF_RATIO = 0.75;

/** Home-parking tail: samples within this radius of the start/anchor (meters). */
export const HOME_DWELL_RADIUS_M = 250;

/** Home-parking tail: dwell at least this long before the tail is trimmed (minutes). */
export const HOME_DWELL_MIN_MIN = 15;

/** Keep this many minutes of samples after the return-home moment. */
export const HOME_DWELL_KEEP_ARRIVAL_MIN = 3;

/** Max points for OSRM /route fallback along a loop leg (chronological waypoints). */
export const LOOP_WAYPOINT_ROUTE_MAX_POINTS = 24;

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

/** True when OSRM snap is tiny / half-loop vs trip extent on a suspected loop day. */
export function isLoopSnapCollapsed(opts: {
  snappedDistanceKm: number | null;
  simplifiedPathDistanceKm: number | null;
  loopSuspicious: boolean;
  ratio?: number;
  visitRouteKm?: number | null;
}): boolean {
  if (!opts.loopSuspicious) return false;
  const snapped = opts.snappedDistanceKm;
  const simplified = opts.simplifiedPathDistanceKm;
  if (snapped == null || simplified == null || simplified < LOOP_MIN_TRIP_KM) return false;
  const ratio = opts.ratio ?? LOOP_SNAP_VS_SIMPLIFIED_RATIO;
  if (snapped < simplified * ratio) return true;
  const visitKm = opts.visitRouteKm;
  if (visitKm != null && Number.isFinite(visitKm) && visitKm >= LOOP_MIN_TRIP_KM) {
    return snapped < visitKm * ratio;
  }
  return false;
}

function sampleTimeMs<T extends { clientRecordedAt?: Date | string }>(
  sample: T,
  index: number,
): number {
  const raw = sample.clientRecordedAt;
  if (raw != null) {
    const t = new Date(raw).getTime();
    if (Number.isFinite(t)) return t;
  }
  return index * 60_000;
}

/**
 * Drop the long parking tail after returning home (Gribovskaya 26.08: 6h jitter).
 * Requires the track to have left the start radius, then a ≥15 min dwell back inside it.
 */
export function trimHomeDwellTail<T extends LatLng & { clientRecordedAt?: Date | string }>(
  samples: T[],
  opts?: { anchor?: LatLng; radiusM?: number; minDwellMin?: number },
): T[] {
  if (samples.length < 2) return samples;
  const anchor = opts?.anchor ?? samples[0]!;
  const radiusM = opts?.radiusM ?? HOME_DWELL_RADIUS_M;
  const minDwellMs = (opts?.minDwellMin ?? HOME_DWELL_MIN_MIN) * 60_000;
  const keepArrivalMs = HOME_DWELL_KEEP_ARRIVAL_MIN * 60_000;
  const distM = (p: LatLng) => haversineDistanceM(anchor.lat, anchor.lng, p.lat, p.lng);

  let departed = false;
  let candidateReturn = -1;
  let candidateReturnTime = 0;

  for (let i = 0; i < samples.length; i++) {
    const inRadius = distM(samples[i]!) <= radiusM;
    const t = sampleTimeMs(samples[i]!, i);
    if (!departed) {
      if (!inRadius) departed = true;
      continue;
    }
    if (candidateReturn < 0) {
      if (inRadius) {
        candidateReturn = i;
        candidateReturnTime = t;
      }
      continue;
    }
    if (!inRadius) {
      candidateReturn = -1;
      continue;
    }
    if (t - candidateReturnTime >= minDwellMs) {
      let keepUntil = candidateReturn;
      for (let j = candidateReturn; j <= i; j++) {
        const tj = sampleTimeMs(samples[j]!, j);
        if (tj - candidateReturnTime <= keepArrivalMs) keepUntil = j;
        else break;
      }
      return samples.slice(0, keepUntil + 1);
    }
  }
  return samples;
}

/** Split a round-trip at the sample farthest from the start (haversine, not max lat). */
export function splitLoopAtFarthest<T extends LatLng>(
  samples: T[],
): { outbound: T[]; inbound: T[]; turnaroundIndex: number } | null {
  if (samples.length < 4) return null;
  const start = samples[0]!;
  let bestI = 0;
  let bestKm = -1;
  for (let i = 1; i < samples.length - 1; i++) {
    const km = haversineKm(start, samples[i]!);
    if (km > bestKm) {
      bestKm = km;
      bestI = i;
    }
  }
  if (bestI < 2 || bestI > samples.length - 3) return null;
  return {
    outbound: samples.slice(0, bestI + 1),
    inbound: samples.slice(bestI),
    turnaroundIndex: bestI,
  };
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
  opts?: { directed?: boolean },
): LatLng[] {
  if (path.length < 2) return path;
  const out: LatLng[] = [path[0]!];
  const seenLongLegs = new Set<string>();
  const directed = opts?.directed === true;

  for (let i = 1; i < path.length; i++) {
    const prev = out[out.length - 1]!;
    const next = path[i]!;
    const legKm = haversineKm(prev, next);
    if (legKm >= minLegKm) {
      const a = coordKey(prev);
      const b = coordKey(next);
      const key = directed ? `${a}>${b}` : a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seenLongLegs.has(key)) {
        continue;
      }
      seenLongLegs.add(key);
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
  opts?: { preserveLoopPath?: boolean },
): ReconcileSnapPathResult {
  const directed = opts?.preserveLoopPath === true;
  let cleaned = directed ? path : dedupeRepeatedPathLegs(path);
  let displayPathPolylineKm = pathDistanceKm(cleaned);
  let pathDistanceMismatch = isPathDistanceInconsistent(cleaned, osrmDistanceKm);

  if (pathDistanceMismatch && !directed) {
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
