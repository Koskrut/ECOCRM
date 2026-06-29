/** Haversine distance on WGS-84 spheroid approximation (metres). */
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

export const VISIT_GPS_MAX_ACCURACY_M = 150;

export type VisitProximityStatus = "verified" | "nearby" | "outside" | "no_fix";

export function visitProximityStatus(input: {
  visitLat: number;
  visitLng: number;
  radiusM: number;
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
}): { status: VisitProximityStatus; distanceM: number | null } {
  const { visitLat, visitLng, radiusM, lat, lng, accuracyM } = input;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { status: "no_fix", distanceM: null };
  }
  const dist = haversineDistanceM(lat, lng, visitLat, visitLng);
  if (
    accuracyM != null &&
    typeof accuracyM === "number" &&
    Number.isFinite(accuracyM) &&
    accuracyM > VISIT_GPS_MAX_ACCURACY_M
  ) {
    return { status: "no_fix", distanceM: dist };
  }
  const tolerance = radiusM <= 0 ? 100 : radiusM;
  if (dist <= tolerance) return { status: "verified", distanceM: dist };
  if (dist <= tolerance + 75) return { status: "nearby", distanceM: dist };
  return { status: "outside", distanceM: dist };
}
