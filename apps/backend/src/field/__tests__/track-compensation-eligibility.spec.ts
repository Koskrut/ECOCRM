import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MIN_TRACK_COMPENSATION_KM,
  MIN_TRACK_COMPENSATION_SAMPLES,
  MIN_TRACK_COVERAGE_RATIO,
  TRACK_END_GRACE_MIN,
  isTrackEligibleForCompensation,
} from "../../visits/route-routing.util";

describe("isTrackEligibleForCompensation", () => {
  it("eligible when tracking shift, 2+ samples, >= 0.5 km, coverage ok", () => {
    const result = isTrackEligibleForCompensation({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 2,
      rawPolylineDistanceKm: 0.5,
      coverageRatio: 0.85,
    });
    assert.equal(result.eligible, true);
    assert.equal(result.reason, null);
  });

  it("rejects when no tracking-enabled shift", () => {
    const result = isTrackEligibleForCompensation({
      hasTrackingEnabledShift: false,
      filteredSampleCount: 100,
      rawPolylineDistanceKm: 50,
      coverageRatio: 1,
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "no_tracking_shift");
  });

  it("rejects when fewer than MIN_TRACK_COMPENSATION_SAMPLES", () => {
    const result = isTrackEligibleForCompensation({
      hasTrackingEnabledShift: true,
      filteredSampleCount: MIN_TRACK_COMPENSATION_SAMPLES - 1,
      rawPolylineDistanceKm: 10,
      coverageRatio: 1,
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "insufficient_gps_samples");
  });

  it("rejects when track shorter than MIN_TRACK_COMPENSATION_KM", () => {
    const result = isTrackEligibleForCompensation({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 10,
      rawPolylineDistanceKm: MIN_TRACK_COMPENSATION_KM - 0.1,
      coverageRatio: 1,
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "track_too_short");
  });

  it("rejects when distance is null", () => {
    const result = isTrackEligibleForCompensation({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 10,
      rawPolylineDistanceKm: null,
      coverageRatio: 1,
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "track_too_short");
  });

  it("rejects when coverage below MIN_TRACK_COVERAGE_RATIO (Gumenyuk-like)", () => {
    assert.equal(MIN_TRACK_COVERAGE_RATIO, 0.7);
    const result = isTrackEligibleForCompensation({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 200,
      rawPolylineDistanceKm: 25,
      coverageRatio: 0.52,
      lastSampleAt: "2026-07-16T07:46:00.000Z",
      lastDoneVisitCompletedAt: "2026-07-16T14:00:00.000Z",
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "gps_low_coverage");
  });

  it("rejects when last sample ends before last DONE visit beyond grace", () => {
    assert.equal(TRACK_END_GRACE_MIN, 45);
    const lastDone = new Date("2026-07-16T14:00:00.000Z");
    const lastSample = new Date(lastDone.getTime() - (TRACK_END_GRACE_MIN + 10) * 60_000);
    const result = isTrackEligibleForCompensation({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 200,
      rawPolylineDistanceKm: 25,
      coverageRatio: 0.9,
      lastSampleAt: lastSample,
      lastDoneVisitCompletedAt: lastDone,
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "gps_ended_before_last_visit");
  });

  it("eligible when last sample is within grace of last DONE visit", () => {
    const lastDone = new Date("2026-07-16T14:00:00.000Z");
    const lastSample = new Date(lastDone.getTime() - (TRACK_END_GRACE_MIN - 5) * 60_000);
    const result = isTrackEligibleForCompensation({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 200,
      rawPolylineDistanceKm: 25,
      coverageRatio: 0.9,
      lastSampleAt: lastSample,
      lastDoneVisitCompletedAt: lastDone,
    });
    assert.equal(result.eligible, true);
    assert.equal(result.reason, null);
  });

  it("Gumenyuk-like: low coverage + track ended early → fact_visits (coverage wins)", () => {
    const result = isTrackEligibleForCompensation({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 180,
      rawPolylineDistanceKm: 18,
      coverageRatio: 0.52,
      lastSampleAt: "2026-07-16T07:46:00.000Z",
      lastDoneVisitCompletedAt: "2026-07-16T15:30:00.000Z",
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "gps_low_coverage");
  });
});
