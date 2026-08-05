import type { LatLng } from "./route-geometry";

/** Canonical route line kinds for plan vs fact comparison. */
export type RouteGeometryKind = "planned" | "fact_visits" | "fact_gps" | "fact_visits_gps";

export type RouteGeometrySource = "osrm" | "fallback" | "raw_gps" | "none";

export type RouteGeometryQuality = {
  sampleCount: number;
  /** 0–1 for GPS tracks: share of shift duration with samples (approx). */
  coverageRatio: number | null;
  degraded: boolean;
  degradedReason: string | null;
  /** Raw filtered polyline distance before road snap (km). */
  rawDistanceKm?: number | null;
  /** Day had at least one shift with trackingEnabled. */
  hasTrackingEnabledShift?: boolean;
  /** Last filtered GPS sample timestamp (ISO). */
  lastSampleAt?: string | null;
  /** Last DONE visit completedAt that day (ISO). */
  lastDoneVisitCompletedAt?: string | null;
  /** Largest straight segment left after stitch gap-fill (km). */
  maxStitchGapKm?: number | null;
  /** True when a straight gap > 1 km remains after OSRM stitch attempts. */
  hasUnfilledGaps?: boolean;
  /** Counts of samples dropped during sanitize (geo / teleport / …). */
  droppedReasons?: Record<string, number>;
  /** True when filter reanchored after a teleport cluster. */
  reanchorUsed?: boolean;
  /** Road-snapped GPS distance (OSRM match sum only). */
  snappedDistanceKm?: number | null;
  /** When snap failed (loop collapse, etc.). */
  snapFailureReason?: string | null;
};

export type RouteGeometryWaypoint = LatLng & {
  label?: string | null;
  visitId?: string | null;
};

export type RouteGeometryResult = {
  kind: RouteGeometryKind;
  source: RouteGeometrySource;
  distanceKm: number | null;
  durationMin: number | null;
  /** Decoded path for map rendering (always present when source !== none). */
  path: LatLng[];
  /** Legacy Google encoded polyline — unused with OSRM (path is always decoded). */
  encodedPolyline: string | null;
  waypoints: RouteGeometryWaypoint[];
  quality: RouteGeometryQuality;
};

export type RouteGeometryBundle = {
  date: string;
  ownerId: string;
  planned: RouteGeometryResult;
  factVisits: RouteGeometryResult;
  factGps: RouteGeometryResult;
  /** Hybrid: visit-order legs with GPS windows matched to roads where samples exist. */
  factVisitsGps: RouteGeometryResult;
  /** Which fact source fuel/compensation should prefer when both exist. */
  compensationFactKind: "fact_gps" | "fact_visits" | "fact_visits_gps" | "none";
  /** Set when compensationFactKind is fact_visits due to GPS eligibility failure, or none for review. */
  compensationIneligibleReason: string | null;
  /** Soft GPS issues when still paying fact_gps (e.g. gps_low_coverage). */
  compensationWarnings?: string[];
  /** True when an open shift exists for this day (incomplete tour UX). */
  shiftActive?: boolean;
  /** Shift still open or tour not yet returned home — KPI footnote hint. */
  incompleteTour?: boolean;
  /** Planned route still has SCHEDULED / in-progress stops (not all DONE). */
  planIncludesScheduled?: boolean;
  /** Last GPS sample within ~2 km of home/end anchor; null when unknown. */
  lastSampleNearHome?: boolean | null;
  /** Soft planned-km outlier warning (does not block GPS payout). */
  plannedKmWarning?: string | null;
};
