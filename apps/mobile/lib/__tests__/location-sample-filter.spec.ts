const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  KEEPALIVE_INTERVAL_MS,
  REANCHOR_GAP_MS,
  TRACK_MAX_ACCURACY_M,
  filterLocationSample,
  formatTeleportRejectLog,
  sortSamplesByTime,
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

  it("reanchors after 15+ min gap (accept far point, no client teleport)", () => {
    assert.equal(REANCHOR_GAP_MS, 15 * 60_000);
    const prev = sample(50.45, 30.52, 0, 20);
    const next = sample(50.55, 30.62, 16 * 60, 20);
    const result = filterLocationSample(prev, next);
    assert.equal(result.accept, true);
    assert.equal(result.reanchor, true);
  });

  it("Gumenyuk: 20 min gap same ~100m area accepts (no teleport)", () => {
    const prev = sample(46.48, 30.72, 0, 20);
    // ~90m north after 20 min — speed ≪ 150 km/h; also gap ≥ REANCHOR
    const next = sample(46.4808, 30.72, 20 * 60, 20);
    const result = filterLocationSample(prev, next);
    assert.equal(result.accept, true);
  });

  it("still rejects short-gap teleport (real jump)", () => {
    const prev = sample(50.45, 30.52, 0, 20);
    const next = sample(51.0, 31.0, 60, 20);
    const result = filterLocationSample(prev, next);
    assert.equal(result.accept, false);
    assert.equal(result.reason, "teleport");
  });

  it("formatTeleportRejectLog includes prev/next and gapMin", () => {
    const prev = sample(50.45, 30.52, 0, 20);
    const next = sample(51.0, 31.0, 60, 20);
    const line = formatTeleportRejectLog(prev, next, 60_000, 80_000);
    assert.match(line, /teleport after gap/);
    assert.match(line, /gapMin=1\.0/);
    assert.match(line, /prev=50\.45000,30\.52000/);
    assert.match(line, /next=51\.00000,31\.00000/);
  });

  it("sortSamplesByTime orders reverse flush batches", () => {
    const a = sample(50.45, 30.52, 120, 20);
    const b = sample(50.45, 30.52, 0, 20);
    const c = sample(50.45, 30.52, 60, 20);
    const sorted = sortSamplesByTime([a, b, c]);
    assert.equal(sorted[0].clientRecordedAt, b.clientRecordedAt);
    assert.equal(sorted[2].clientRecordedAt, a.clientRecordedAt);
  });
});
