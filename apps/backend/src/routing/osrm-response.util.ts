import type { LatLng } from "../visits/route-geometry";

export type OsrmRouteResponse = {
  code?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: {
      type?: string;
      coordinates?: Array<[number, number]>;
    };
  }>;
};

export type OsrmMatchResponse = {
  code?: string;
  matchings?: Array<{
    distance?: number;
    duration?: number;
    confidence?: number;
    geometry?: {
      type?: string;
      coordinates?: Array<[number, number]>;
    };
  }>;
};

function parseGeojsonPath(
  geometry: { type?: string; coordinates?: Array<[number, number]> } | undefined,
): LatLng[] | null {
  const coords = geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;

  const path: LatLng[] = [];
  for (const pair of coords) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const lng = pair[0];
    const lat = pair[1];
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    path.push({ lat, lng });
  }
  return path.length >= 2 ? path : null;
}

function metricsFromDistanceDuration(distanceM: number | undefined, durationSec: number | undefined) {
  const distM = typeof distanceM === "number" ? distanceM : null;
  const durSec = typeof durationSec === "number" ? durationSec : null;
  return {
    distanceKm: distM != null ? Math.round((distM / 1000) * 10) / 10 : null,
    durationMin: durSec != null ? Math.round(durSec / 60) : null,
  };
}

export function parseOsrmRouteResponse(data: OsrmRouteResponse): {
  distanceKm: number | null;
  durationMin: number | null;
  path: LatLng[];
} | null {
  if (data.code !== "Ok") return null;
  const route = data.routes?.[0];
  if (!route) return null;

  const path = parseGeojsonPath(route.geometry);
  if (!path) return null;

  return {
    ...metricsFromDistanceDuration(route.distance, route.duration),
    path,
  };
}

/**
 * Parse OSRM map-matching response (`/match/v1/...`).
 * Gaps in the GPS trace produce multiple matchings — sum distance/duration
 * and concatenate geometries (taking only matchings[0] under-reports badly).
 */
export function parseOsrmMatchResponse(data: OsrmMatchResponse): {
  distanceKm: number | null;
  durationMin: number | null;
  path: LatLng[];
} | null {
  if (data.code !== "Ok") return null;
  const matchings = data.matchings;
  if (!Array.isArray(matchings) || matchings.length === 0) return null;

  let distanceM = 0;
  let durationSec = 0;
  let hasDist = false;
  let hasDur = false;
  const path: LatLng[] = [];

  for (const matching of matchings) {
    if (typeof matching.distance === "number" && Number.isFinite(matching.distance)) {
      distanceM += matching.distance;
      hasDist = true;
    }
    if (typeof matching.duration === "number" && Number.isFinite(matching.duration)) {
      durationSec += matching.duration;
      hasDur = true;
    }
    const segment = parseGeojsonPath(matching.geometry);
    if (!segment) continue;
    for (const p of segment) {
      const last = path[path.length - 1];
      if (!last || last.lat !== p.lat || last.lng !== p.lng) {
        path.push(p);
      }
    }
  }

  if (path.length < 2) return null;

  return {
    distanceKm: hasDist ? Math.round((distanceM / 1000) * 10) / 10 : null,
    durationMin: hasDur ? Math.round(durationSec / 60) : null,
    path,
  };
}

export function buildOsrmCoordinatePath(
  origin: LatLng,
  intermediates: LatLng[],
  destination: LatLng,
): string {
  const chain = [origin, ...intermediates, destination];
  return chain.map((p) => `${p.lng},${p.lat}`).join(";");
}

export function buildOsrmTraceCoordinatePath(points: LatLng[]): string {
  return points.map((p) => `${p.lng},${p.lat}`).join(";");
}
