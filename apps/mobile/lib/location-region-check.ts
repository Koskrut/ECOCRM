/** Approximate Ukraine field-ops bbox (aligned with backend gps-sample-filter). */
export const UA_FIELD_LAT_MIN = 44;
export const UA_FIELD_LAT_MAX = 53;
export const UA_FIELD_LNG_MIN = 22;
export const UA_FIELD_LNG_MAX = 41;

export type UaRegionRejectReason = "invalid_coords" | "out_of_region";

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
