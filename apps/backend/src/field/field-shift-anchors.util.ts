import { haversineDistanceM } from "../visits/visit-gps.verification";

/** Garage proximity for shift start/end defaults (product: ~1 km). */
export const SHIFT_HOME_NEAR_M = 1000;

export type FieldShiftAnchorKindValue = "HOME" | "CURRENT";

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

/** Default origin: HOME when GPS is within ~1 km of garage, else CURRENT. */
export function suggestOriginKind(
  gps: LatLng | null | undefined,
  garage: LatLng | null | undefined,
): FieldShiftAnchorKindValue {
  if (garage && isNearHome(gps, garage)) return "HOME";
  if (gps) return "CURRENT";
  if (garage) return "HOME";
  return "CURRENT";
}

/** Default destination: HOME when last GPS within ~1 km of garage, else CURRENT. */
export function suggestDestinationKind(
  lastGps: LatLng | null | undefined,
  garage: LatLng | null | undefined,
): FieldShiftAnchorKindValue {
  if (garage && isNearHome(lastGps, garage)) return "HOME";
  if (lastGps) return "CURRENT";
  if (garage) return "HOME";
  return "CURRENT";
}

export function parseAnchorKind(raw: unknown): FieldShiftAnchorKindValue | null {
  if (raw === "HOME" || raw === "CURRENT") return raw;
  return null;
}

export type FieldShiftMobilityModeValue = "CAR" | "WALK_TRANSIT";

export function parseMobilityMode(raw: unknown): FieldShiftMobilityModeValue | null {
  if (raw === "CAR" || raw === "WALK_TRANSIT") return raw;
  return null;
}

export function parseClientLatLng(input: {
  lat?: number | null;
  lng?: number | null;
}): LatLng | null {
  const lat = input.lat != null ? Number(input.lat) : NaN;
  const lng = input.lng != null ? Number(input.lng) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
