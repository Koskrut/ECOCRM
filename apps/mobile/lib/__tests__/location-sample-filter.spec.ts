const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  KEEPALIVE_INTERVAL_MS,
  REANCHOR_GAP_MS,
  TRACK_MAX_ACCURACY_M,
  filterLocationSample,
} = require("../location-sample-filter");

function sample(lat: number, lng: number, seconds: number, accuracyM: number) {
  const base = new Date("2026-06-25T08:00:00.000Z");
  return {
    lat,
    lng,
    accuracyM,
    clientRecordedAt: new Date(base.getTime() + seconds * 1000).toISOString(),
  };
}

describe("filterLocationSample", () => {
  it("rejects duplicate within MIN_DISTANCE_DEDUP_M before keepalive interval", () => {
    const prev = sample(50.45, 30.52, 0, 20);
    const next = sample(50.45005, 30.52005, 60, 20);
    const result = filterLocationSample(prev, next);
    assert.equal(result.accept, false);
    assert.equal(result.reason, "duplicate");
  });

  it("accepts keepalive duplicate after KEEPALIVE_INTERVAL_MS", () => {
    assert.equal(KEEPALIVE_INTERVAL_MS, 3 * 60_000);
    const prev = sample(50.45, 30.52, 0, 20);
    const next = sample(50.45005, 30.52005, 60 * 3 + 1, 20);
    const result = filterLocationSample(prev, next);
    assert.equal(result.accept, true);
  });

  it("rejects poor accuracy above TRACK_MAX_ACCURACY_M", () => {
    const next = sample(50.45, 30.52, 0, TRACK_MAX_ACCURACY_M + 1);
    const result = filterLocationSample(null, next);
    assert.equal(result.accept, false);
    assert.equal(result.reason, "bad_accuracy");
  });

  it("rejects same-timestamp jump beyond dedup (match backend)", () => {
    const prev = sample(50.45, 30.52, 0, 20);
    const next = sample(50.46, 30.53, 0, 20);
    const result = filterLocationSample(prev, next);
    assert.equal(result.accept, false);
    assert.equal(result.reason, "teleport");
  });

  it("rejects older-timestamp jump beyond dedup (match backend)", () => {
    const prev = sample(50.45, 30.52, 60, 20);
    const next = sample(50.46, 30.53, 0, 20);
    const result = filterLocationSample(prev, next);
    assert.equal(result.accept, false);
    assert.equal(result.reason, "teleport");
  });

  it("reanchors after 30+ min gap (accept far point, no client teleport)", () => {
    assert.equal(REANCHOR_GAP_MS, 30 * 60_000);
    const prev = sample(50.45, 30.52, 0, 20);
    const next = sample(50.55, 30.62, 31 * 60, 20);
    const result = filterLocationSample(prev, next);
    assert.equal(result.accept, true);
  });
});
