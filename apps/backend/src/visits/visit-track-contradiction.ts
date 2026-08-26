import { haversineDistanceM } from "./visit-gps.verification";
import type { LatLng } from "./route-geometry";

/** Track must approach visit pin within this distance to "confirm" the trip. */
export const VISIT_TRACK_APPROACH_M = 1000;

const OFF_ADDRESS_VERIFICATIONS = new Set(["OUTSIDE_RADIUS", "NO_FIX"]);

export function minDistanceTrackToPinM(
  track: LatLng[],
  pin: LatLng,
): number | null {
  if (track.length === 0) return null;
  let min = Number.POSITIVE_INFINITY;
  for (const p of track) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    const d = haversineDistanceM(p.lat, p.lng, pin.lat, pin.lng);
    if (d < min) min = d;
  }
  return Number.isFinite(min) ? min : null;
}

/**
 * True when a DONE visit was closed off-address (OUTSIDE_RADIUS / NO_FIX)
 * and the day's GPS track never approached the pin (~1 km).
 * Do not flag when tracking started on approach and touched the pin.
 */
export function hasVisitTrackContradiction(opts: {
  visits: Array<{
    completeGpsVerification?: string | null;
    lat: number | null;
    lng: number | null;
  }>;
  trackPoints: LatLng[];
  approachM?: number;
}): boolean {
  const approachM = opts.approachM ?? VISIT_TRACK_APPROACH_M;
  for (const v of opts.visits) {
    if (!v.completeGpsVerification || !OFF_ADDRESS_VERIFICATIONS.has(v.completeGpsVerification)) {
      continue;
    }
    if (v.lat == null || v.lng == null || !Number.isFinite(v.lat) || !Number.isFinite(v.lng)) {
      continue;
    }
    const minM = minDistanceTrackToPinM(opts.trackPoints, { lat: v.lat, lng: v.lng });
    // No track at all, or never within approach → contradiction.
    if (minM == null || minM > approachM) {
      return true;
    }
  }
  return false;
}
