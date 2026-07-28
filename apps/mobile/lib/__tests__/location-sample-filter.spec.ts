const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  KEEPALIVE_INTERVAL_MS,
  TRACK_MAX_ACCURACY_M,
  filterLocationSample,
} = require("../location-sample-filter");

function sample(lat, lng, seconds, accuracyM) {
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
});
