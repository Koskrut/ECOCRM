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

export type FuelCalculationSnapshot = {
  visits: FuelVisitSnapshotRow[];
  plannedMetricsSource: string | null;
  /** Legacy: fact by completed visits order. */
  factMetricsSource: string | null;
  factVisitsMetricsSource?: string | null;
  factGpsMetricsSource?: string | null;
  /** fact_gps | fact_visits — which source was used for compensationKm. */
  compensationFactKind?: "fact_gps" | "fact_visits";
  routeAnchors?: FuelRouteAnchorsSnapshot;
};
