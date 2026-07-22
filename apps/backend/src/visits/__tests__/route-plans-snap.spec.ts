import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RoutePlansService } from "../route-plans.service";
import { haversineDistanceM } from "../visit-gps.verification";
import type { LatLng } from "../route-geometry";

function haversineKm(a: LatLng, b: LatLng): number {
  return haversineDistanceM(a.lat, a.lng, b.lat, b.lng) / 1000;
}

/** 100+ parking jitter points within ~200 m + distant endpoints. */
function jitterParkingChunk(): LatLng[] {
  const start = { lat: 50.45, lng: 30.52 };
  const end = { lat: 50.55, lng: 30.62 };
  const points: LatLng[] = [start];
  for (let i = 0; i < 110; i++) {
    points.push({
      lat: start.lat + Math.sin(i * 0.7) * 0.0008,
      lng: start.lng + Math.cos(i * 0.5) * 0.0008,
    });
  }
  points.push(end);
  return points;
}

describe("RoutePlansService.snapGpsPathToRoads", () => {
  it("fallback uses start→end only when /match fails (not all jitter waypoints)", async () => {
    const points = jitterParkingChunk();
    const start = points[0]!;
    const end = points[points.length - 1]!;
    const straightKm = haversineKm(start, end);
    let routeLegCallsWithIntermediates = 0;

    const osrm = {
      matchTrack: async () => null,
      routeLeg: async (opts: {
        origin: LatLng;
        destination: LatLng;
        intermediates: LatLng[];
      }) => {
        if (opts.intermediates.length > 0) {
          routeLegCallsWithIntermediates += 1;
          return {
            source: "osrm" as const,
            path: [opts.origin, ...opts.intermediates, opts.destination],
            distanceKm: opts.intermediates.length * 5,
            durationMin: null,
          };
        }
        return {
          source: "osrm" as const,
          path: [opts.origin, opts.destination],
          distanceKm: Math.round(straightKm * 1.2 * 10) / 10,
          durationMin: null,
        };
      },
    };

    const svc = new RoutePlansService({} as never, osrm as never);
    const result = await svc.snapGpsPathToRoads(points);

    assert.equal(routeLegCallsWithIntermediates, 0);
    assert.ok(result.distanceKm != null);
    assert.ok(result.distanceKm <= straightKm * 1.5, `got ${result.distanceKm} vs straight ${straightKm}`);
    assert.ok(result.distanceKm < straightKm * 10);
  });

  it("distance sums chunk km, not dense stitched polyline length", async () => {
    const points = jitterParkingChunk();
    const start = points[0]!;
    const end = points[points.length - 1]!;
    const straightKm = haversineKm(start, end);
    const chunkKm = Math.round(straightKm * 1.2 * 10) / 10;

    const osrm = {
      matchTrack: async () => ({
        source: "osrm" as const,
        path: Array.from({ length: 200 }, (_, i) => ({
          lat: start.lat + ((end.lat - start.lat) * i) / 199,
          lng: start.lng + ((end.lng - start.lng) * i) / 199,
        })),
        distanceKm: chunkKm,
        durationMin: null,
      }),
      routeLeg: async () => null,
    };

    const svc = new RoutePlansService({} as never, osrm as never);
    const result = await svc.snapGpsPathToRoads(points);

    assert.equal(result.distanceKm, chunkKm);
    assert.ok(result.path.length > 50);
  });
});
