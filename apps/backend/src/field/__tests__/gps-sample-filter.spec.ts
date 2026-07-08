import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_IMPLAUSIBLE_SPEED_KMH,
  MIN_DISTANCE_DEDUP_M,
  TRACK_MAX_ACCURACY_M,
  filterGpsSample,
  filterGpsTrack,
} from "../gps-sample-filter";

function sample(
  lat: number,
  lng: number,
  seconds: number,
  accuracyM?: number,
): { lat: number; lng: number; accuracyM?: number; clientRecordedAt: string } {
  const base = new Date("2026-06-25T08:00:00.000Z");
  return {
    lat,
    lng,
    accuracyM,
    clientRecordedAt: new Date(base.getTime() + seconds * 1000).toISOString(),
  };
}

describe("filterGpsSample", () => {
  it("rejects poor accuracy above 150m", () => {
    const next = sample(50.45, 30.52, 0, TRACK_MAX_ACCURACY_M + 1);
    const result = filterGpsSample(null, next);
    assert.equal(result.accept, false);
    assert.equal(result.reason, "bad_accuracy");
  });

  it("accepts accuracy at exactly 150m", () => {
    const next = sample(50.45, 30.52, 0, TRACK_MAX_ACCURACY_M);
    const result = filterGpsSample(null, next);
    assert.equal(result.accept, true);
  });

  it("accepts first sample with good accuracy", () => {
    const next = sample(50.45, 30.52, 0, 20);
    const result = filterGpsSample(null, next);
    assert.equal(result.accept, true);
  });

  it("rejects duplicate within MIN_DISTANCE_DEDUP_M", () => {
    const prev = sample(50.45, 30.52, 0, 20);
    const next = sample(50.45005, 30.52005, 60, 20);
    const result = filterGpsSample(prev, next);
    assert.equal(result.accept, false);
    assert.equal(result.reason, "duplicate");
  });

  it("accepts sample beyond MIN_DISTANCE_DEDUP_M", () => {
    const prev = sample(50.45, 30.52, 0, 20);
    const next = sample(50.4502, 30.5202, 30, 20);
    const result = filterGpsSample(prev, next);
    assert.equal(result.accept, true);
  });

  it("rejects teleport jumps above 150 km/h", () => {
    const prev = sample(50.45, 30.52, 0, 20);
    const next = sample(51.0, 31.0, 10, 20);
    const result = filterGpsSample(prev, next);
    assert.equal(result.accept, false);
    assert.equal(result.reason, "teleport");
  });

  it("accepts plausible movement", () => {
    const prev = sample(50.45, 30.52, 0, 20);
    const next = sample(50.4505, 30.5205, 30, 20);
    const result = filterGpsSample(prev, next);
    assert.equal(result.accept, true);
  });

  it("rejects speed just above MAX_IMPLAUSIBLE_SPEED_KMH", () => {
    const prev = sample(50.45, 30.52, 0, 20);
    const distDeg = (MAX_IMPLAUSIBLE_SPEED_KMH / 3600) * 10 / 111;
    const next = sample(50.45 + distDeg, 30.52, 10, 20);
    const result = filterGpsSample(prev, next);
    assert.equal(result.accept, false);
    assert.equal(result.reason, "teleport");
  });
});

describe("filterGpsTrack", () => {
  it("filters a chain of five points keeping valid segments", () => {
    const chain = [
      sample(50.45, 30.52, 0, 20),
      sample(50.45005, 30.52005, 30, 20),
      sample(50.4503, 30.5203, 60, 20),
      sample(50.4506, 30.5206, 90, TRACK_MAX_ACCURACY_M + 50),
      sample(50.451, 30.521, 120, 25),
    ];
    const filtered = filterGpsTrack(chain);
    assert.equal(filtered.length, 3);
    assert.equal(filtered[0]!.lat, 50.45);
    assert.equal(filtered[1]!.lat, 50.4503);
    assert.equal(filtered[2]!.lat, 50.451);
  });

  it("keeps chain when points are spaced beyond dedup threshold", () => {
    const chain = [
      sample(50.45, 30.52, 0, 20),
      sample(50.4503, 30.5203, 60, 20),
      sample(50.451, 30.521, 120, 25),
    ];
    const filtered = filterGpsTrack(chain);
    assert.equal(filtered.length, 3);
  });
});
