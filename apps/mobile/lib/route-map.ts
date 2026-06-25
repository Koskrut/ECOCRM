export type LatLng = { lat: number; lng: number };

export function isValidLatLng(p: LatLng | null | undefined): p is LatLng {
  if (!p || typeof p !== "object") return false;
  const { lat, lng } = p;
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/** Drop null/NaN/out-of-range coordinates before map rendering. */
export function sanitizePath(path?: LatLng[] | null): LatLng[] {
  if (!Array.isArray(path)) return [];
  return path.filter(isValidLatLng);
}

export type RouteGeometryResult = {
  kind: string;
  source: string;
  distanceKm: number | null;
  path: LatLng[];
  quality: {
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

function downsample(points: LatLng[], max = 80): LatLng[] {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  const out: LatLng[] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]!);
  const last = points[points.length - 1]!;
  const tail = out[out.length - 1];
  if (!tail || tail.lat !== last.lat || tail.lng !== last.lng) out.push(last);
  return out;
}

/** Google Static Maps path (max URL length — keep points sparse). */
export function buildStaticMapUrl(opts: {
  apiKey: string;
  paths: Array<{ color: string; points: LatLng[] }>;
  size?: string;
}): string | null {
  const paths = opts.paths
    .map((p) => ({ ...p, points: sanitizePath(p.points) }))
    .filter((p) => p.points.length >= 2);
  if (paths.length === 0) return null;

  const segments = paths.map((p) => {
    const pts = downsample(p.points, 60)
      .map((x) => `${x.lat.toFixed(5)},${x.lng.toFixed(5)}`)
      .join("|");
    return `path=color:${encodeURIComponent(p.color)}|weight:4|${pts}`;
  });

  const all = paths.flatMap((p) => p.points);
  const center = all[Math.floor(all.length / 2)] ?? all[0];
  if (!center) return null;

  const base = "https://maps.googleapis.com/maps/api/staticmap";
  const params = new URLSearchParams({
    size: opts.size ?? "640x360",
    scale: "2",
    maptype: "roadmap",
    key: opts.apiKey,
  });
  const url = `${base}?${params.toString()}&center=${center.lat},${center.lng}&zoom=11&${segments.join("&")}`;
  if (url.length > 7800) return null;
  return url;
}
