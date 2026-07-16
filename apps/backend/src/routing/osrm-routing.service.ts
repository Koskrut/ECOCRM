import { Injectable, Logger } from "@nestjs/common";
import type { LatLng } from "../visits/route-geometry";
import {
  buildOsrmCoordinatePath,
  parseOsrmRouteResponse,
  type OsrmRouteResponse,
} from "./osrm-response.util";

export type OsrmRoutedLegResult = {
  distanceKm: number | null;
  durationMin: number | null;
  path: LatLng[];
  source: "osrm" | "fallback";
};

const DEFAULT_TIMEOUT_MS = 15_000;

@Injectable()
export class OsrmRoutingService {
  private readonly logger = new Logger(OsrmRoutingService.name);

  resolveBaseUrl(): string {
    const raw = process.env.OSRM_BASE_URL?.trim() || "http://osrm:5000";
    return raw.replace(/\/$/, "");
  }

  resolveProfile(): string {
    const p = process.env.ROUTING_PROFILE?.trim();
    return p || "car";
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number | null; error?: string }> {
    const started = Date.now();
    try {
      const base = this.resolveBaseUrl();
      const url = `${base}/route/v1/${this.resolveProfile()}/30.5234,50.4501;30.5240,50.4510?overview=false`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (!res.ok) {
        return { ok: false, latencyMs: Date.now() - started, error: `HTTP ${res.status}` };
      }
      const data = (await res.json()) as OsrmRouteResponse;
      if (data.code !== "Ok") {
        return { ok: false, latencyMs: Date.now() - started, error: data.code ?? "unknown" };
      }
      return { ok: true, latencyMs: Date.now() - started };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, latencyMs: null, error: message };
    }
  }

  async routeLeg(opts: {
    origin: LatLng;
    destination: LatLng;
    intermediates: LatLng[];
  }): Promise<OsrmRoutedLegResult | null> {
    const base = this.resolveBaseUrl();
    if (!base) return null;

    const coordPath = buildOsrmCoordinatePath(opts.origin, opts.intermediates, opts.destination);
    const params = new URLSearchParams({
      overview: "full",
      geometries: "geojson",
      steps: "false",
    });
    const url = `${base}/route/v1/${this.resolveProfile()}/${coordPath}?${params.toString()}`;

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        this.logger.warn(`OSRM ${res.status}: ${errBody.slice(0, 400)}`);
        return null;
      }
      const data = (await res.json()) as OsrmRouteResponse;
      const parsed = parseOsrmRouteResponse(data);
      if (!parsed) {
        this.logger.warn(`OSRM no route: code=${data.code ?? "unknown"}`);
        return null;
      }
      return { ...parsed, source: "osrm" };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn(`OSRM request failed: ${message}`);
      return null;
    }
  }
}
