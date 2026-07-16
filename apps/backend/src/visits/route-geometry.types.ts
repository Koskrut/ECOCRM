import type { LatLng } from "./route-geometry";

/** Canonical route line kinds for plan vs fact comparison. */
export type RouteGeometryKind = "planned" | "fact_visits" | "fact_gps";

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
  /** Which fact source fuel/compensation should prefer when both exist. */
  compensationFactKind: "fact_gps" | "fact_visits";
};
