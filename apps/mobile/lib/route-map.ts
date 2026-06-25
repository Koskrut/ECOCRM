export type LatLng = { lat: number; lng: number };

export function isValidLatLng(p: LatLng | null | undefined): p is LatLng {
  if (!p || typeof p !== "object") return false;
  const { lat, lng } = p;
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/** Accept {lat,lng} or {latitude,longitude} from API / legacy payloads. */
export function normalizeRoutePoint(raw: unknown): LatLng | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const lat = o.lat ?? o.latitude;
  const lng = o.lng ?? o.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return isValidLatLng({ lat, lng }) ? { lat, lng } : null;
}

/** Drop invalid / duplicate coordinates before map rendering. */
export function sanitizePath(path?: unknown[] | null): LatLng[] {
  if (!Array.isArray(path)) return [];
  const out: LatLng[] = [];
  for (const raw of path) {
    const p = normalizeRoutePoint(raw);
    if (!p) continue;
    const last = out[out.length - 1];
    if (last && last.lat === p.lat && last.lng === p.lng) continue;
    out.push(p);
  }
  return out;
}

export function downsamplePath(points: LatLng[], max = 80): LatLng[] {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  const out: LatLng[] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]!);
  const last = points[points.length - 1]!;
  const tail = out[out.length - 1];
  if (!tail || tail.lat !== last.lat || tail.lng !== last.lng) out.push(last);
  return out;
}

export type RouteGeometryResult = {
  kind: string;
  source: string;
  distanceKm: number | null;
  path: LatLng[];
  waypoints?: Array<{ lat?: number; lng?: number; latitude?: number; longitude?: number }>;
  quality?: {
    sampleCount: number;
    coverageRatio: number | null;
    degraded: boolean;
    degradedReason: string | null;
  };
};

export type RouteGeometryBundle = {
  date: string;
  planned: RouteGeometryResult;
  factVisits: RouteGeometryResult;
  factGps: RouteGeometryResult;
  compensationFactKind: "fact_gps" | "fact_visits";
};

const EMPTY_GEOMETRY: RouteGeometryResult = {
  kind: "none",
  source: "none",
  distanceKm: null,
  path: [],
  waypoints: [],
  quality: {
    sampleCount: 0,
    coverageRatio: null,
    degraded: true,
    degradedReason: "missing",
  },
};

function normalizeGeometry(raw: unknown, kind: string): RouteGeometryResult {
  if (!raw || typeof raw !== "object") {
    return { ...EMPTY_GEOMETRY, kind };
  }
  const g = raw as RouteGeometryResult;
  const waypointPath = sanitizePath(g.waypoints ?? []);
  const path = sanitizePath(g.path);
  return {
    kind: g.kind ?? kind,
    source: g.source ?? "none",
    distanceKm: typeof g.distanceKm === "number" ? g.distanceKm : null,
    path: path.length >= 2 ? path : waypointPath,
    waypoints: waypointPath,
    quality: g.quality ?? EMPTY_GEOMETRY.quality,
  };
}

/** Defensive parse for geometry bundle API responses. */
export function normalizeGeometryBundle(raw: unknown): RouteGeometryBundle | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Partial<RouteGeometryBundle>;
  if (typeof b.date !== "string") return null;
  return {
    date: b.date,
    planned: normalizeGeometry(b.planned, "planned"),
    factVisits: normalizeGeometry(b.factVisits, "fact_visits"),
    factGps: normalizeGeometry(b.factGps, "fact_gps"),
    compensationFactKind:
      b.compensationFactKind === "fact_gps" ? "fact_gps" : "fact_visits",
  };
}

export function layerPath(geometry: RouteGeometryResult | null | undefined): LatLng[] {
  if (!geometry) return [];
  const path = sanitizePath(geometry.path);
  if (path.length >= 2) return path;
  return sanitizePath(geometry.waypoints ?? []);
}

/** Google Static Maps path (max URL length — keep points sparse). */
export function buildStaticMapUrl(opts: {
  apiKey: string;
  paths: Array<{ color: string; points: LatLng[] }>;
  size?: string;
}): string | null {
  const cleaned = opts.paths
    .map((p) => ({ ...p, points: sanitizePath(p.points) }))
    .filter((p) => p.points.length >= 2);
  if (cleaned.length === 0) return null;

  const base = "https://maps.googleapis.com/maps/api/staticmap";
  const params = new URLSearchParams({
    size: opts.size ?? "640x360",
    scale: "2",
    maptype: "roadmap",
    key: opts.apiKey,
  });

  for (let maxPts = 60; maxPts >= 8; maxPts -= 8) {
    const segments = cleaned.map((p) => {
      const pts = downsamplePath(p.points, maxPts)
        .map((x) => `${x.lat.toFixed(5)},${x.lng.toFixed(5)}`)
        .join("|");
      return `path=color:${p.color}|weight:4|${pts}`;
    });

    const all = cleaned.flatMap((p) => downsamplePath(p.points, maxPts));
    const center = all[Math.floor(all.length / 2)] ?? all[0];
    if (!center) return null;

    const url = `${base}?${params.toString()}&center=${center.lat},${center.lng}&zoom=11&${segments.join("&")}`;
    if (url.length <= 7800) return url;
  }

  return null;
}
