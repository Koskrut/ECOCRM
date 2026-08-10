const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  classifyUaFieldCoords,
  coerceLatLng,
  formatUaRegionRejectLog,
  isNearZeroCoord,
  validateRawLocationSample,
} = require("../location-region-check");
const { TRACK_MAX_ACCURACY_M } = require("../location-sample-filter");

describe("coerceLatLng", () => {
  it("coerces numeric strings before bbox", () => {
    const c = coerceLatLng("48.39", "35.01");
    assert.ok(c);
    assert.equal(c.lat, 48.39);
    assert.equal(c.lng, 35.01);
  });

  it("rejects NaN / non-numeric", () => {
    assert.equal(coerceLatLng(NaN, 35), null);
    assert.equal(coerceLatLng("x", "y"), null);
  });
});

describe("classifyUaFieldCoords", () => {
  it("accepts Dnipro", () => {
    const r = classifyUaFieldCoords(48.39, 35.01);
    assert.equal(r.ok, true);
  });

  it("splits invalid_coords from out_of_region", () => {
    const bad = classifyUaFieldCoords(NaN, 35.01);
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.reason, "invalid_coords");

    const lima = classifyUaFieldCoords(-12.04, -77.05);
    assert.equal(lima.ok, false);
    if (!lima.ok) assert.equal(lima.reason, "out_of_region");
  });
});

describe("formatUaRegionRejectLog", () => {
  it("includes lat lng accuracy and typeof", () => {
    const line = formatUaRegionRejectLog("out_of_region", 0, 0, 12.5);
    assert.match(line, /out_of_region/);
    assert.match(line, /lat=0/);
    assert.match(line, /lng=0/);
    assert.match(line, /accuracy=12\.5/);
    assert.match(line, /typeofLat=number/);
    assert.match(line, /typeofLng=number/);
  });
});

describe("isNearZeroCoord", () => {
  it("detects origin and sub-meter junk", () => {
    assert.equal(isNearZeroCoord(0, 0), true);
    assert.equal(isNearZeroCoord(0.00001, -0.00002), true);
    assert.equal(isNearZeroCoord(48.39, 35.01), false);
  });
});

describe("validateRawLocationSample", () => {
  it("rejects mock before region", () => {
    const r = validateRawLocationSample({
      lat: 48.39,
      lng: 35.01,
      mocked: true,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "mock");
  });

  it("rejects near-zero as invalid_coords", () => {
    const r = validateRawLocationSample({ lat: 0, lng: 0 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "invalid_coords");
  });

  it("rejects bad accuracy before UA bbox", () => {
    const r = validateRawLocationSample({
      lat: 48.39,
      lng: 35.01,
      accuracyM: TRACK_MAX_ACCURACY_M + 1,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "bad_accuracy");
  });

  it("rejects Lima as out_of_region", () => {
    const r = validateRawLocationSample({ lat: -12.04, lng: -77.05, accuracyM: 20 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "out_of_region");
  });

  it("accepts valid UA sample", () => {
    const r = validateRawLocationSample({ lat: 48.39, lng: 35.01, accuracyM: 20 });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.lat, 48.39);
      assert.equal(r.lng, 35.01);
    }
  });
});
