/** Max horizontal accuracy — keep in sync with location-sample-filter / backend. */
const TRACK_MAX_ACCURACY_M = 150;

/** Approximate Ukraine field-ops bbox (aligned with backend gps-sample-filter). */
export const UA_FIELD_LAT_MIN = 44;
export const UA_FIELD_LAT_MAX = 53;
export const UA_FIELD_LNG_MIN = 22;
export const UA_FIELD_LNG_MAX = 41;

export type UaRegionRejectReason = "invalid_coords" | "out_of_region";

export type RawLocationRejectReason = UaRegionRejectReason | "bad_accuracy" | "mock";

export type ValidateRawLocationResult =
  | { ok: true; lat: number; lng: number }
  | { ok: false; reason: RawLocationRejectReason; logLine: string };

const NEAR_ZERO_EPS = 0.0001;

export type UaRegionCheckResult =
  | { ok: true; lat: number; lng: number }
  | {
      ok: false;
      reason: UaRegionRejectReason;
      lat: number | null;
      lng: number | null;
    };

export function coerceLatLng(
  lat: unknown,
  lng: unknown,
): { lat: number; lng: number } | null {
  const la = typeof lat === "number" ? lat : Number(lat);
  const ln = typeof lng === "number" ? lng : Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  return { lat: la, lng: ln };
}

/**
 * Coerce then UA bbox. NaN / non-numeric → invalid_coords (not out_of_region).
 */
export function classifyUaFieldCoords(lat: unknown, lng: unknown): UaRegionCheckResult {
  const coerced = coerceLatLng(lat, lng);
  if (!coerced) {
    const la = typeof lat === "number" ? lat : Number(lat);
    const ln = typeof lng === "number" ? lng : Number(lng);
    return {
      ok: false,
      reason: "invalid_coords",
      lat: Number.isFinite(la) ? la : null,
      lng: Number.isFinite(ln) ? ln : null,
    };
  }
  if (
    coerced.lat < UA_FIELD_LAT_MIN ||
    coerced.lat > UA_FIELD_LAT_MAX ||
    coerced.lng < UA_FIELD_LNG_MIN ||
    coerced.lng > UA_FIELD_LNG_MAX
  ) {
    return { ok: false, reason: "out_of_region", lat: coerced.lat, lng: coerced.lng };
  }
  return { ok: true, lat: coerced.lat, lng: coerced.lng };
}

/** Client warn line — always include raw coords + typeof for field triage. */
export function isNearZeroCoord(lat: number, lng: number): boolean {
  return Math.abs(lat) < NEAR_ZERO_EPS && Math.abs(lng) < NEAR_ZERO_EPS;
}

/** Drop junk coords before buffer — mock, near-zero, bad accuracy, UA bbox. */
export function validateRawLocationSample(input: {
  lat: unknown;
  lng: unknown;
  accuracyM?: number | null;
  mocked?: boolean;
}): ValidateRawLocationResult {
  if (input.mocked) {
    return { ok: false, reason: "mock", logLine: "location sample skipped: reason=mock" };
  }

  const coerced = coerceLatLng(input.lat, input.lng);
  if (coerced && isNearZeroCoord(coerced.lat, coerced.lng)) {
    return {
      ok: false,
      reason: "invalid_coords",
      logLine: formatUaRegionRejectLog("invalid_coords", input.lat, input.lng, input.accuracyM),
    };
  }

  const acc = input.accuracyM;
  if (
    acc != null &&
    typeof acc === "number" &&
    Number.isFinite(acc) &&
    acc > TRACK_MAX_ACCURACY_M
  ) {
    return {
      ok: false,
      reason: "bad_accuracy",
      logLine:
        `location sample skipped: bad_accuracy` +
        ` lat=${String(input.lat)} lng=${String(input.lng)} accuracy=${acc}`,
    };
  }

  const region = classifyUaFieldCoords(input.lat, input.lng);
  if (!region.ok) {
    return {
      ok: false,
      reason: region.reason,
      logLine: formatUaRegionRejectLog(region.reason, input.lat, input.lng, input.accuracyM),
    };
  }

  return { ok: true, lat: region.lat, lng: region.lng };
}

export function formatUaRegionRejectLog(
  reason: UaRegionRejectReason,
  lat: unknown,
  lng: unknown,
  accuracyM?: unknown,
): string {
  const acc =
    accuracyM == null
      ? "null"
      : typeof accuracyM === "number" && Number.isFinite(accuracyM)
        ? String(accuracyM)
        : String(accuracyM);
  return (
    `location sample skipped: ${reason}` +
    ` lat=${String(lat)} lng=${String(lng)} accuracy=${acc}` +
    ` typeofLat=${typeof lat} typeofLng=${typeof lng}`
  );
}
