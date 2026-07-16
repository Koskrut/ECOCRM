export type FuelVisitSnapshotRow = {
  id: string;
  title: string | null;
  completedAt: string | null;
  lat: number | null;
  lng: number | null;
  startGpsVerification: string | null;
  completeGpsVerification: string | null;
  includedInRoute: boolean;
  hasCoordinates: boolean;
};

export type FuelRouteAnchorsSnapshot = {
  startLabel: string | null;
  endLabel: string | null;
  hasExplicitStart: boolean;
  hasExplicitEnd: boolean;
  usesSettingsAnchors: boolean;
};

export type TrackMetricsSource = "track" | "track_fallback" | "none";

export type FuelCalculationSnapshot = {
  visits: FuelVisitSnapshotRow[];
  plannedMetricsSource: string | null;
  /** Legacy: fact by completed visits order. */
  factMetricsSource: string | null;
  factVisitsMetricsSource?: string | null;
  factGpsMetricsSource?: string | null;
  /** fact_gps | fact_visits — which source was used for compensationKm. */
  compensationFactKind?: "fact_gps" | "fact_visits";
  /** GPS track distance (km), regardless of payout source. */
  trackKm?: number | null;
  trackMetricsSource?: TrackMetricsSource;
  /** Visit-order route distance (km), reference / fallback. */
  visitRouteKm?: number | null;
  routeAnchors?: FuelRouteAnchorsSnapshot;
};

export function resolveTrackMetricsSource(
  source: string | null | undefined,
): TrackMetricsSource {
  if (source === "osrm" || source === "google") return "track";
  if (source === "raw_gps" || source === "fallback") return "track_fallback";
  return "none";
}
