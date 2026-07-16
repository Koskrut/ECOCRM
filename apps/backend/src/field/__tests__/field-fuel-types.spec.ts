import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveTrackMetricsSource } from "../field-fuel.types";

describe("resolveTrackMetricsSource", () => {
  it("maps osrm and legacy google to track", () => {
    assert.equal(resolveTrackMetricsSource("osrm"), "track");
    assert.equal(resolveTrackMetricsSource("google"), "track");
  });

  it("maps raw_gps and fallback to track_fallback", () => {
    assert.equal(resolveTrackMetricsSource("raw_gps"), "track_fallback");
    assert.equal(resolveTrackMetricsSource("fallback"), "track_fallback");
  });

  it("maps unknown to none", () => {
    assert.equal(resolveTrackMetricsSource("none"), "none");
    assert.equal(resolveTrackMetricsSource(null), "none");
  });
});
