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

export function parseOsrmRouteResponse(data: OsrmRouteResponse): {
  distanceKm: number | null;
  durationMin: number | null;
  path: LatLng[];
} | null {
  if (data.code !== "Ok") return null;
  const route = data.routes?.[0];
  if (!route) return null;

  const coords = route.geometry?.coordinates;
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
  if (path.length < 2) return null;

  const distM = typeof route.distance === "number" ? route.distance : null;
  const durSec = typeof route.duration === "number" ? route.duration : null;

  return {
    distanceKm: distM != null ? Math.round((distM / 1000) * 10) / 10 : null,
    durationMin: durSec != null ? Math.round(durSec / 60) : null,
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
