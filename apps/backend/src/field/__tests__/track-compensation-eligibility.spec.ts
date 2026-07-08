import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MIN_TRACK_COMPENSATION_KM,
  MIN_TRACK_COMPENSATION_SAMPLES,
  isTrackEligibleForCompensation,
} from "../../visits/route-routing.util";

describe("isTrackEligibleForCompensation", () => {
  it("eligible when tracking shift, 2+ samples, >= 0.5 km", () => {
    const result = isTrackEligibleForCompensation({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 2,
      rawPolylineDistanceKm: 0.5,
    });
    assert.equal(result.eligible, true);
    assert.equal(result.reason, null);
  });

  it("rejects when no tracking-enabled shift", () => {
    const result = isTrackEligibleForCompensation({
      hasTrackingEnabledShift: false,
      filteredSampleCount: 100,
      rawPolylineDistanceKm: 50,
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "no_tracking_shift");
  });

  it("rejects when fewer than MIN_TRACK_COMPENSATION_SAMPLES", () => {
    const result = isTrackEligibleForCompensation({
      hasTrackingEnabledShift: true,
      filteredSampleCount: MIN_TRACK_COMPENSATION_SAMPLES - 1,
      rawPolylineDistanceKm: 10,
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "insufficient_gps_samples");
  });

  it("rejects when track shorter than MIN_TRACK_COMPENSATION_KM", () => {
    const result = isTrackEligibleForCompensation({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 10,
      rawPolylineDistanceKm: MIN_TRACK_COMPENSATION_KM - 0.1,
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "track_too_short");
  });

  it("rejects when distance is null", () => {
    const result = isTrackEligibleForCompensation({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 10,
      rawPolylineDistanceKm: null,
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "track_too_short");
  });
});
