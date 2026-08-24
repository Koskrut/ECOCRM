import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isSuccessfulSnapSource,
  shouldShowGpsFallbackBanner,
  isDashedFallbackLine,
  collectTeamFitBoundsPoints,
} from "../route-map-style";

describe("isSuccessfulSnapSource", () => {
  it("osrm is success", () => assert.equal(isSuccessfulSnapSource("osrm"), true));
  it("google is success (legacy)", () => assert.equal(isSuccessfulSnapSource("google"), true));
  it("fallback is not success", () => assert.equal(isSuccessfulSnapSource("fallback"), false));
  it("raw_gps is not success", () => assert.equal(isSuccessfulSnapSource("raw_gps"), false));
  it("none is not success", () => assert.equal(isSuccessfulSnapSource("none"), false));
  it("null is not success", () => assert.equal(isSuccessfulSnapSource(null), false));
});

describe("shouldShowGpsFallbackBanner", () => {
  it("shows for fallback with path", () =>
    assert.equal(shouldShowGpsFallbackBanner("fallback", 10, true), true));
  it("shows for none with path", () =>
    assert.equal(shouldShowGpsFallbackBanner("none", 5, true), true));
  it("does NOT show for osrm", () =>
    assert.equal(shouldShowGpsFallbackBanner("osrm", 10, true), false));
  it("does NOT show for osrm with stitch gaps (P0 requirement)", () =>
    assert.equal(shouldShowGpsFallbackBanner("osrm", 50, true), false));
  it("does NOT show for google", () =>
    assert.equal(shouldShowGpsFallbackBanner("google", 10, true), false));
  it("does NOT show for raw_gps", () =>
    assert.equal(shouldShowGpsFallbackBanner("raw_gps", 10, true), false));
  it("does NOT show when layer is off", () =>
    assert.equal(shouldShowGpsFallbackBanner("fallback", 10, false), false));
  it("does NOT show for short path", () =>
    assert.equal(shouldShowGpsFallbackBanner("fallback", 1, true), false));
  it("does NOT show for null source", () =>
    assert.equal(shouldShowGpsFallbackBanner(null, 10, true), false));
});

describe("isDashedFallbackLine", () => {
  it("fallback is dashed", () => assert.equal(isDashedFallbackLine("fallback"), true));
  it("osrm is NOT dashed (even with gaps)", () =>
    assert.equal(isDashedFallbackLine("osrm"), false));
  it("google is NOT dashed", () => assert.equal(isDashedFallbackLine("google"), false));
  it("raw_gps is NOT dashed", () => assert.equal(isDashedFallbackLine("raw_gps"), false));
  it("none is NOT dashed", () => assert.equal(isDashedFallbackLine("none"), false));
});

describe("collectTeamFitBoundsPoints", () => {
  const track = [
    { lat: 50.45, lng: 30.52 },
    { lat: 50.46, lng: 30.53 },
  ];
  const shiftOnly = [
    { lat: 50.47, lng: 30.54 },
    { lat: 50.48, lng: 30.55 },
  ];
  const marker = { lat: 50.49, lng: 30.56 };

  it("includes track path points", () => {
    const pts = collectTeamFitBoundsPoints({ trackPath: track });
    assert.equal(pts.length, 2);
  });

  it("includes shiftOnlyPath", () => {
    const pts = collectTeamFitBoundsPoints({ trackPath: track, shiftOnlyPath: shiftOnly });
    assert.equal(pts.length, 4);
  });

  it("includes selected marker", () => {
    const pts = collectTeamFitBoundsPoints({ trackPath: track, selectedMarker: marker });
    assert.equal(pts.length, 3);
    assert.deepEqual(pts[2], marker);
  });

  it("returns empty for no inputs", () => {
    assert.equal(collectTeamFitBoundsPoints({}).length, 0);
  });

  it("returns empty for null track", () => {
    assert.equal(collectTeamFitBoundsPoints({ trackPath: null }).length, 0);
  });

  it("does NOT include unselected overlay markers (not passed)", () => {
    const pts = collectTeamFitBoundsPoints({ trackPath: track, selectedMarker: null });
    assert.equal(pts.length, 2);
  });
});
