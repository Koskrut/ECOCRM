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

/** Payout source for compensationKm. fact_gps is legacy (pre policy v2); never written by v2. */
export type FuelCompensationFactKind = "planned" | "fact_gps" | "fact_visits" | "none";

export type FuelCalculationSnapshot = {
  visits: FuelVisitSnapshotRow[];
  plannedMetricsSource: string | null;
  /** Legacy: fact by completed visits order. */
  factMetricsSource: string | null;
  factVisitsMetricsSource?: string | null;
  factGpsMetricsSource?: string | null;
  /** planned | fact_visits | none (legacy fact_gps may exist on old snapshots). */
  compensationFactKind?: FuelCompensationFactKind;
  /** Policy id, e.g. plan_primary_gps_display. */
  payoutPolicy?: string;
  /** Policy version so DRAFT migrates when payout rules change. */
  payoutPolicyVersion?: string;
  /** Audit: why this km was chosen. */
  payoutReason?: string | null;
  /** DONE plan stops counted toward planned payout. */
  payoutConfirmedStopCount?: number;
  /** Total route-plan stops for the day. */
  payoutPlanStopCount?: number;
  /** GPS track distance (km), regardless of payout source. */
  trackKm?: number | null;
  /** Raw filtered polyline before road snap (km). */
  rawPolylineDistanceKm?: number | null;
  /** OSRM-snapped track distance (km). */
  snappedTrackDistanceKm?: number | null;
  /** When road snap failed (loop collapse, etc.). */
  snapFailureReason?: string | null;
  trackMetricsSource?: TrackMetricsSource;
  /** Visit-order route distance (km), reference / fallback. */
  visitRouteKm?: number | null;
  /** Why GPS was not used when falling back to visits (hard reject). */
  compensationIneligibleReason?: string | null;
  /** 0–1 GPS coverage of shift duration. */
  coverageRatio?: number | null;
  routeAnchors?: FuelRouteAnchorsSnapshot;
  /** Samples kept after geo + reanchor + relative filter. */
  filteredSampleCount?: number;
  /** Reject reason counts from sanitizeGpsTrack. */
  droppedReasons?: Record<string, number>;
  /** True when GPS filter reanchored during the day. */
  reanchorUsed?: boolean;
  /** Soft / product warnings (low coverage payout, planned outlier, …). */
  warnings?: string[];
  /** Planned km kept for display but marked unreliable. */
  plannedKmDegraded?: boolean;
};

export function resolveTrackMetricsSource(
  source: string | null | undefined,
): TrackMetricsSource {
  if (source === "osrm" || source === "google") return "track";
  if (source === "raw_gps" || source === "fallback") return "track_fallback";
  return "none";
}
