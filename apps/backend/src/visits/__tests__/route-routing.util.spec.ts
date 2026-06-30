import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  concatPaths,
  downsamplePathUniform,
  MAX_INTERMEDIATES_PER_LEG,
  splitRouteLegs,
  sumLegMetrics,
} from "../route-routing.util";
import { pathFromWaypoints } from "../polyline.util";

describe("splitRouteLegs", () => {
  const pt = (i: number) => ({ lat: 50 + i * 0.01, lng: 30 + i * 0.01 });

  it("returns single leg when intermediates fit limit", () => {
    const intermediates = Array.from({ length: 10 }, (_, i) => pt(i + 1));
    const legs = splitRouteLegs(pt(0), intermediates, pt(11));
    assert.equal(legs.length, 1);
    assert.equal(legs[0]!.intermediates.length, 10);
  });

  it("splits 30 waypoints into multiple legs with overlap", () => {
    const intermediates = Array.from({ length: 30 }, (_, i) => pt(i + 1));
    const legs = splitRouteLegs(pt(0), intermediates, pt(31));
    assert.ok(legs.length >= 2);
    for (const leg of legs) {
      assert.ok(leg.intermediates.length <= MAX_INTERMEDIATES_PER_LEG);
    }
    assert.equal(legs[0]!.destination.lat, legs[1]!.origin.lat);
    assert.equal(legs[0]!.destination.lng, legs[1]!.origin.lng);
    const lastLeg = legs[legs.length - 1]!;
    assert.equal(lastLeg.destination.lat, pt(31).lat);
  });
});

describe("concatPaths", () => {
  it("merges without duplicate stitch point", () => {
    const a = [
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 },
    ];
    const b = [
      { lat: 2, lng: 2 },
      { lat: 3, lng: 3 },
    ];
    const merged = concatPaths([a, b]);
    assert.equal(merged.length, 3);
    assert.deepEqual(merged[1], { lat: 2, lng: 2 });
  });
});

describe("sumLegMetrics", () => {
  it("sums distance and duration", () => {
    const r = sumLegMetrics([
      { distanceKm: 10.2, durationMin: 15 },
      { distanceKm: 5.3, durationMin: 8 },
    ]);
    assert.equal(r.distanceKm, 15.5);
    assert.equal(r.durationMin, 23);
  });
});

describe("downsamplePathUniform", () => {
  it("keeps endpoints", () => {
    const path = Array.from({ length: 200 }, (_, i) => ({ lat: i, lng: i }));
    const out = downsamplePathUniform(path, 100);
    assert.equal(out[0]!.lat, 0);
    assert.equal(out[out.length - 1]!.lat, 199);
    assert.ok(out.length <= 100);
  });
});

describe("multi-leg path vs straight fallback", () => {
  it("concatenated leg paths have more points than waypoint chain", () => {
    const origin = { lat: 50.45, lng: 30.52 };
    const destination = { lat: 50.46, lng: 30.54 };
    const intermediates = Array.from({ length: 5 }, (_, i) => ({
      lat: 50.45 + i * 0.002,
      lng: 30.52 + i * 0.002,
    }));
    const straight = pathFromWaypoints(origin, intermediates, destination);
    const simulatedLegPaths = [
      [
        origin,
        { lat: 50.451, lng: 30.521 },
        { lat: 50.452, lng: 30.522 },
        intermediates[0]!,
      ],
      [
        intermediates[0]!,
        { lat: 50.453, lng: 30.523 },
        intermediates[2]!,
        destination,
      ],
    ];
    const road = concatPaths(simulatedLegPaths);
    assert.ok(road.length > straight.length);
  });
});
