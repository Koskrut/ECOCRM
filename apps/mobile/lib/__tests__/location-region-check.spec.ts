const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  classifyUaFieldCoords,
  coerceLatLng,
  formatUaRegionRejectLog,
} = require("../location-region-check");

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
