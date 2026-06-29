import geoip from "geoip-lite";

export type IpGeoResult = {
  city: string | null;
  region: string | null;
  country: string | null;
};

const geoCache = new Map<string, IpGeoResult>();

function normalizeIp(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("::ffff:")) {
    return trimmed.slice(7);
  }
  return trimmed;
}

export function resolveIpGeo(rawIp?: string | null): IpGeoResult {
  const ip = normalizeIp(rawIp);
  if (!ip) {
    return { city: null, region: null, country: null };
  }

  const cached = geoCache.get(ip);
  if (cached) return cached;

  const lookup = geoip.lookup(ip);
  const result: IpGeoResult = {
    city: lookup?.city ?? null,
    region: lookup?.region ?? null,
    country: lookup?.country ?? null,
  };
  geoCache.set(ip, result);
  return result;
}

export function extractClientIp(req: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}): string | null {
  const forwarded = req.headers?.["x-forwarded-for"];
  const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (forwardedIp) {
    const first = forwardedIp.split(",")[0]?.trim();
    if (first) return first;
  }
  return normalizeIp(req.ip);
}
