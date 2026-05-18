import { VisitGpsVerification } from "@prisma/client";

/** Max horizontal accuracy that we still trust for geo-fence verification (metres). */
export const VISIT_GPS_MAX_ACCURACY_M = 150;

export type VisitGpsPayloadInput = {
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
  clientRecordedAt?: string | Date | null;
  permissionState?: string | null;
  locationProvider?: string | null;
};

/** Haversine distance on WGS‑84 spheroid approximation; good enough for field checks up to tens of km. */
export function haversineDistanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
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

/**
 * Applies MVP rules documented in docs/mobile-manager-app/01-mvp-scope.md .
 */
export function verifyVisitAgainstPlannedLocation(input: {
  visitLat?: number | null;
  visitLng?: number | null;
  radiusM: number;
  payload?: VisitGpsPayloadInput | null;
}): { verification: VisitGpsVerification; distanceToPlannedM: number | null } {
  const { visitLat, visitLng, radiusM, payload } = input;
  if (visitLat == null || visitLng == null) {
    return { verification: VisitGpsVerification.MANUAL_REVIEW, distanceToPlannedM: null };
  }
  const lat = payload?.lat;
  const lng = payload?.lng;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { verification: VisitGpsVerification.NO_FIX, distanceToPlannedM: null };
  }

  const dist = haversineDistanceM(lat, lng, visitLat, visitLng);
  const acc = payload?.accuracyM;
  const badAccuracy =
    acc != null && typeof acc === "number" && Number.isFinite(acc) && acc > VISIT_GPS_MAX_ACCURACY_M;

  // Low accuracy fix is still geo-referenced — keep distance for audit.
  if (badAccuracy) {
    return {
      verification: VisitGpsVerification.NO_FIX,
      distanceToPlannedM: dist,
    };
  }

  const tolerance = radiusM <= 0 ? 100 : radiusM;

  let verification: VisitGpsVerification = VisitGpsVerification.OUTSIDE_RADIUS;
  if (dist <= tolerance) verification = VisitGpsVerification.VERIFIED;
  else if (dist <= tolerance + 75) verification = VisitGpsVerification.NEARBY_WARNING;

  return { verification, distanceToPlannedM: dist };
}
