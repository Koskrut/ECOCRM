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

  it("loop home→away→home: rejects collapsed A→B snap km (Mykhailiv symptom)", async () => {
    const home = { lat: 49.233, lng: 28.468 };
    const far = { lat: 49.85, lng: 29.55 };
    const points: LatLng[] = [home];
    for (let i = 1; i <= 50; i++) {
      const t = i / 50;
      points.push({
        lat: home.lat + (far.lat - home.lat) * t,
        lng: home.lng + (far.lng - home.lng) * t,
      });
    }
    for (let i = 1; i <= 50; i++) {
      const t = i / 50;
      points.push({
        lat: far.lat + (home.lat - far.lat) * t,
        lng: far.lng + (home.lng - far.lng) * t,
      });
    }
    points.push({ lat: home.lat + 0.008, lng: home.lng + 0.006 });

    const osrm = {
      matchTrack: async () => ({
        source: "osrm" as const,
        path: [home, points[points.length - 1]!],
        distanceKm: 1.4,
        durationMin: null,
      }),
      routeLeg: async (opts: { origin: LatLng; destination: LatLng }) => ({
        source: "osrm" as const,
        path: [opts.origin, opts.destination],
        distanceKm: 1.4,
        durationMin: null,
      }),
    };

    const svc = new RoutePlansService({} as never, osrm as never);
    const result = await svc.snapGpsPathToRoads(points);

    assert.equal(result.snapFailureReason, "gps_snap_loop_collapse");
    assert.equal(result.distanceKm, null);
  });

  it("parking jitter: snapped km well below raw polyline sum", async () => {
    const points = jitterParkingChunk();
    const start = points[0]!;
    const end = points[points.length - 1]!;
    const straightKm = haversineKm(start, end);
    const chunkKm = Math.round(straightKm * 1.05 * 10) / 10;

    const osrm = {
      matchTrack: async () => ({
        source: "osrm" as const,
        path: [start, end],
        distanceKm: chunkKm,
        durationMin: null,
      }),
      routeLeg: async () => null,
    };

    const svc = new RoutePlansService({} as never, osrm as never);
    const result = await svc.snapGpsPathToRoads(points);

    assert.ok(result.distanceKm != null);
    assert.ok(result.distanceKm <= straightKm * 1.2);
    assert.ok(result.distanceKm < 50);
  });

  it("Gribovsky 26.08 loop: split both legs, ignore home jitter, not half-match", async () => {
    const home = { lat: 49.8235, lng: 24.1397 };
    const visit = { lat: 50.243, lng: 24.138 };
    const points: LatLng[] = [home];
    for (let i = 1; i <= 40; i++) {
      const t = i / 40;
      points.push({
        lat: home.lat + (visit.lat - home.lat) * t,
        lng: home.lng + (visit.lng - home.lng) * t,
      });
    }
    for (let i = 1; i <= 40; i++) {
      const t = i / 40;
      points.push({
        lat: visit.lat + (home.lat - visit.lat) * t,
        lng: visit.lng + (home.lng - visit.lng) * t,
      });
    }
    for (let i = 0; i < 80; i++) {
      points.push({
        lat: home.lat + Math.sin(i * 0.4) * 0.0005,
        lng: home.lng + Math.cos(i * 0.3) * 0.0005,
      });
    }

    const osrm = {
      matchTrack: async (pts: LatLng[]) => {
        const a = pts[0]!;
        const b = pts[pts.length - 1]!;
        const straight = haversineKm(a, b);
        if (straight <= 2) {
          return {
            source: "osrm" as const,
            path: [a, b],
            distanceKm: 68.9,
            durationMin: null,
          };
        }
        const km = Math.round(straight * 1.2 * 10) / 10;
        return {
          source: "osrm" as const,
          path: [a, { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 }, b],
          distanceKm: km,
          durationMin: null,
        };
      },
      routeLeg: async (opts: { origin: LatLng; destination: LatLng; intermediates: LatLng[] }) => {
        const chain = [opts.origin, ...opts.intermediates, opts.destination];
        let sum = 0;
        for (let i = 1; i < chain.length; i++) {
          sum += haversineKm(chain[i - 1]!, chain[i]!);
        }
        const km = Math.round(sum * 1.15 * 10) / 10;
        return {
          source: "osrm" as const,
          path: chain,
          distanceKm: km,
          durationMin: null,
        };
      },
    };

    const svc = new RoutePlansService({} as never, osrm as never);
    const result = await svc.snapGpsPathToRoads(points);

    assert.equal(result.snapFailureReason, null);
    assert.ok(result.distanceKm != null, "expected snapped km");
    assert.ok(result.distanceKm >= 110, `got ${result.distanceKm}`);
    assert.ok(result.distanceKm <= 150, `got ${result.distanceKm}`);
    assert.ok(result.path.some((p) => p.lat > 50.2), "path should reach the visit");
    const last = result.path[result.path.length - 1]!;
    assert.ok(haversineKm(last, home) < 3, "path should return home");
  });

  it("non-loop A→B day is unchanged (no loop split)", async () => {
    const start = { lat: 50.45, lng: 30.52 };
    const end = { lat: 50.55, lng: 30.62 };
    const points: LatLng[] = Array.from({ length: 40 }, (_, i) => ({
      lat: start.lat + ((end.lat - start.lat) * i) / 39,
      lng: start.lng + ((end.lng - start.lng) * i) / 39,
    }));
    const straightKm = haversineKm(start, end);
    const chunkKm = Math.round(straightKm * 1.1 * 10) / 10;
    let matchCalls = 0;

    const osrm = {
      matchTrack: async () => {
        matchCalls += 1;
        return {
          source: "osrm" as const,
          path: points,
          distanceKm: chunkKm,
          durationMin: null,
        };
      },
      routeLeg: async () => null,
    };

    const svc = new RoutePlansService({} as never, osrm as never);
    const result = await svc.snapGpsPathToRoads(points);

    assert.equal(result.snapFailureReason, null);
    assert.equal(result.distanceKm, chunkKm);
    assert.ok(matchCalls >= 1);
    assert.ok(matchCalls <= 2, `unexpected extra matches from loop split: ${matchCalls}`);
  });
});
