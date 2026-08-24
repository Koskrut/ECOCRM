/**
 * Pure helpers for route line styling / banner logic.
 * No google.maps dependency — testable with node:test.
 */

export type RouteSource = "osrm" | "google" | "fallback" | "raw_gps" | "none";

/** Road-snapped source that should render as a solid success line. */
export function isSuccessfulSnapSource(source: string | null | undefined): boolean {
  return source === "osrm" || source === "google";
}

/** True only for sources that warrant a "GPS, not roads" banner. */
export function shouldShowGpsFallbackBanner(
  source: string | null | undefined,
  pathLength: number,
  layerOn: boolean,
): boolean {
  if (!layerOn || source == null) return false;
  if (pathLength < 2) return false;
  return source === "fallback" || source === "none";
}

/** True when the line should be dashed (straight-line fallback only). */
export function isDashedFallbackLine(source: string | null | undefined): boolean {
  return source === "fallback";
}

/**
 * Collect fit-bounds points scoped to the selected employee's track,
 * not all team overlay markers (which span across Ukraine).
 */
export function collectTeamFitBoundsPoints(opts: {
  trackPath?: Array<{ lat: number; lng: number }> | null;
  shiftOnlyPath?: Array<{ lat: number; lng: number }> | null;
  selectedMarker?: { lat: number; lng: number } | null;
}): Array<{ lat: number; lng: number }> {
  const pts: Array<{ lat: number; lng: number }> = [];
  if (opts.trackPath) {
    for (const p of opts.trackPath) pts.push({ lat: p.lat, lng: p.lng });
  }
  if (opts.shiftOnlyPath) {
    for (const p of opts.shiftOnlyPath) pts.push({ lat: p.lat, lng: p.lng });
  }
  if (opts.selectedMarker) pts.push(opts.selectedMarker);
  return pts;
}
