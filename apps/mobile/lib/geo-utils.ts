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

/** Garage proximity for shift start/end defaults (~1 km). */
export const SHIFT_HOME_NEAR_M = 1000;

export type FieldShiftAnchorKind = "HOME" | "CURRENT";

export type LatLng = { lat: number; lng: number };

export function isNearHome(
  point: LatLng | null | undefined,
  garage: LatLng | null | undefined,
  nearM: number = SHIFT_HOME_NEAR_M,
): boolean {
  if (!point || !garage) return false;
  if (
    !Number.isFinite(point.lat) ||
    !Number.isFinite(point.lng) ||
    !Number.isFinite(garage.lat) ||
    !Number.isFinite(garage.lng)
  ) {
    return false;
  }
  return haversineDistanceM(point.lat, point.lng, garage.lat, garage.lng) <= nearM;
}

export function suggestOriginKind(
  gps: LatLng | null | undefined,
  garage: LatLng | null | undefined,
): FieldShiftAnchorKind {
  if (garage && isNearHome(gps, garage)) return "HOME";
  if (gps) return "CURRENT";
  if (garage) return "HOME";
  return "CURRENT";
}

export function suggestDestinationKind(
  lastGps: LatLng | null | undefined,
  garage: LatLng | null | undefined,
): FieldShiftAnchorKind {
  if (garage && isNearHome(lastGps, garage)) return "HOME";
  if (lastGps) return "CURRENT";
  if (garage) return "HOME";
  return "CURRENT";
}

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
