import type { Region } from "react-native-maps";

export type LatLng = { lat: number; lng: number };

export type RouteWaypoint = LatLng & {
  label?: string | null;
  visitId?: string | null;
};

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

export function normalizeWaypoint(raw: unknown): RouteWaypoint | null {
  const pt = normalizeRoutePoint(raw);
  if (!pt) return null;
  const o = raw as Record<string, unknown>;
  return {
    ...pt,
    label: typeof o.label === "string" && o.label.trim() ? o.label.trim() : null,
    visitId: typeof o.visitId === "string" && o.visitId ? o.visitId : null,
  };
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

export function sanitizeWaypoints(waypoints?: unknown[] | null): RouteWaypoint[] {
  if (!Array.isArray(waypoints)) return [];
  const out: RouteWaypoint[] = [];
  for (const raw of waypoints) {
    const wp = normalizeWaypoint(raw);
    if (!wp) continue;
    const last = out[out.length - 1];
    if (last && last.lat === wp.lat && last.lng === wp.lng) continue;
    out.push(wp);
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
  durationMin: number | null;
  path: LatLng[];
  waypoints: RouteWaypoint[];
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
  durationMin: null,
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
  const g = raw as Partial<RouteGeometryResult> & { waypoints?: unknown[] };
  const labeledWaypoints = sanitizeWaypoints(g.waypoints ?? []);
  const waypointPath = labeledWaypoints.map(({ lat, lng }) => ({ lat, lng }));
  const path = sanitizePath(g.path);
  return {
    kind: g.kind ?? kind,
    source: g.source ?? "none",
    distanceKm: typeof g.distanceKm === "number" ? g.distanceKm : null,
    durationMin: typeof g.durationMin === "number" ? g.durationMin : null,
    path: path.length >= 2 ? path : waypointPath,
    waypoints: labeledWaypoints,
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
  return geometry.waypoints.map(({ lat, lng }) => ({ lat, lng }));
}

export function layerWaypoints(geometry: RouteGeometryResult | null | undefined): RouteWaypoint[] {
  if (!geometry) return [];
  return sanitizeWaypoints(geometry.waypoints);
}

const DEFAULT_REGION: Region = {
  latitude: 50.4501,
  longitude: 30.5234,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

/** Fit map region to a set of coordinates with padding. */
export function computeMapRegion(points: LatLng[], paddingFactor = 1.35): Region {
  const valid = sanitizePath(points);
  if (valid.length === 0) return DEFAULT_REGION;

  if (valid.length === 1) {
    const p = valid[0]!;
    return {
      latitude: p.lat,
      longitude: p.lng,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    };
  }

  let minLat = valid[0]!.lat;
  let maxLat = valid[0]!.lat;
  let minLng = valid[0]!.lng;
  let maxLng = valid[0]!.lng;

  for (const p of valid) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }

  const latDelta = Math.max((maxLat - minLat) * paddingFactor, 0.01);
  const lngDelta = Math.max((maxLng - minLng) * paddingFactor, 0.01);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}

/** Google Static Maps path (max URL length — keep points sparse). */
export function buildStaticMapUrl(opts: {
  apiKey: string;
  paths: Array<{ color: string; points: LatLng[] }>;
  markers?: Array<{ lat: number; lng: number; color?: string; label?: string }>;
  size?: string;
}): string | null {
  const cleaned = opts.paths
    .map((p) => ({ ...p, points: sanitizePath(p.points) }))
    .filter((p) => p.points.length >= 2);

  const markerPts = (opts.markers ?? [])
    .map((m) => normalizeRoutePoint(m))
    .filter((m): m is LatLng => m != null);

  if (cleaned.length === 0 && markerPts.length === 0) return null;

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

    const markerSegments = markerPts.map((m, i) => {
      const color = opts.markers?.[i]?.color ?? "red";
      const label = (opts.markers?.[i]?.label?.slice(0, 1) ?? String(i + 1)).charAt(0);
      return `markers=color:${color}|label:${label}|${m.lat.toFixed(5)},${m.lng.toFixed(5)}`;
    });

    const all = [...cleaned.flatMap((p) => downsamplePath(p.points, maxPts)), ...markerPts];
    const center = all[Math.floor(all.length / 2)] ?? markerPts[0] ?? null;
    if (!center) return null;

    const parts = [
      `${base}?${params.toString()}`,
      `center=${center.lat},${center.lng}`,
      `zoom=11`,
      ...segments,
      ...markerSegments,
    ];
    const url = parts.join("&");
    if (url.length <= 7800) return url;
  }

  return null;
}
