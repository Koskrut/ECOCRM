import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MIN_TRACK_COMPENSATION_KM,
  MIN_TRACK_COMPENSATION_SAMPLES,
  MIN_TRACK_COVERAGE_RATIO,
  TRACK_END_GRACE_MIN,
  isTrackEligibleForCompensation,
  selectCompensationFactKind,
  isHybridUsableForLoopCollapse,
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

  it("rejects truncated match vs visits (0.6 vs 14.8 with good coverage)", () => {
    const result = isTrackEligibleForCompensation({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 178,
      rawPolylineDistanceKm: 16,
      coverageRatio: 0.85,
      snappedTrackDistanceKm: 0.6,
      visitRouteDistanceKm: 14.8,
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "gps_implausibly_short_vs_visits");
  });

  it("rejects zero match segment vs visits (Mykhailiv-like)", () => {
    const result = isTrackEligibleForCompensation({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 115,
      rawPolylineDistanceKm: 19.4,
      coverageRatio: 0.8,
      snappedTrackDistanceKm: 0,
      visitRouteDistanceKm: 23.8,
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "gps_implausibly_short_vs_visits");
  });

  it("rejects Gumenyuk-like track ~50% of visit route with good coverage", () => {
    const result = isTrackEligibleForCompensation({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 180,
      rawPolylineDistanceKm: 17.4,
      coverageRatio: 0.85,
      snappedTrackDistanceKm: 17.4,
      visitRouteDistanceKm: 35.1,
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "gps_implausibly_short_vs_visits");
  });

  it("keeps fact_gps when snapped track is above sanity ratio", () => {
    const result = isTrackEligibleForCompensation({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 178,
      rawPolylineDistanceKm: 16,
      coverageRatio: 0.85,
      snappedTrackDistanceKm: 15.7,
      visitRouteDistanceKm: 14.8,
    });
    assert.equal(result.eligible, true);
    assert.equal(result.reason, null);
  });

  it("rejects near-zero snap even when visit route < 2 km", () => {
    const result = isTrackEligibleForCompensation({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 80,
      rawPolylineDistanceKm: 8,
      coverageRatio: 0.9,
      snappedTrackDistanceKm: 0.2,
      visitRouteDistanceKm: 1.5,
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "gps_implausibly_short_vs_visits");
  });

  it("rejects Isanchev-like inflated track vs visits (long)", () => {
    const result = isTrackEligibleForCompensation({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 200,
      rawPolylineDistanceKm: 220,
      coverageRatio: 0.85,
      snappedTrackDistanceKm: 229.1,
      visitRouteDistanceKm: 10.8,
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "gps_implausibly_long_vs_visits");
  });

  it("rejects Gumenyuk 17.07 inflated track 54 vs visits 15.3 (long)", () => {
    const result = isTrackEligibleForCompensation({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 180,
      rawPolylineDistanceKm: 50,
      coverageRatio: 0.85,
      snappedTrackDistanceKm: 54.1,
      visitRouteDistanceKm: 15.3,
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "gps_implausibly_long_vs_visits");
  });

  it("Gumenyuk 20.07 after fix: track 17 vs visits 35 → short ineligible", () => {
    const result = isTrackEligibleForCompensation({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 180,
      rawPolylineDistanceKm: 17,
      coverageRatio: 0.85,
      snappedTrackDistanceKm: 17,
      visitRouteDistanceKm: 35.1,
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "gps_implausibly_short_vs_visits");
  });
});

describe("selectCompensationFactKind", () => {
  it("WALK_TRANSIT → none / non_vehicle_day even with healthy GPS + visits", () => {
    const sel = selectCompensationFactKind({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 200,
      rawPolylineDistanceKm: 40,
      coverageRatio: 0.95,
      snappedTrackDistanceKm: 38,
      visitRouteDistanceKm: 42,
      mobilityMode: "WALK_TRANSIT",
    });
    assert.equal(sel.kind, "none");
    assert.equal(sel.ineligibleReason, "non_vehicle_day");
    assert.ok(sel.warnings.includes("non_vehicle_day"));
  });

  it("CAR (default) still uses normal GPS eligibility", () => {
    const sel = selectCompensationFactKind({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 200,
      rawPolylineDistanceKm: 40,
      coverageRatio: 0.95,
      snappedTrackDistanceKm: 38,
      visitRouteDistanceKm: 42,
      mobilityMode: "CAR",
    });
    assert.equal(sel.kind, "fact_gps");
    assert.equal(sel.ineligibleReason, null);
  });

  it("Hrybovska 31.07: track 18.8 + low coverage + no visits → fact_gps", () => {
    const sel = selectCompensationFactKind({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 14,
      rawPolylineDistanceKm: 18.8,
      coverageRatio: 0.54,
      snappedTrackDistanceKm: 18.8,
      visitRouteDistanceKm: null,
    });
    assert.equal(sel.kind, "fact_gps");
    assert.ok(sel.warnings.includes("gps_low_coverage"));
    assert.ok(sel.warnings.includes("gps_partial_coverage"));
  });

  it("Hrybovska 25.08: low coverage + visit line → fact_visits (not hybrid)", () => {
    const sel = selectCompensationFactKind({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 100,
      rawPolylineDistanceKm: 48,
      coverageRatio: 0.53,
      snappedTrackDistanceKm: 33,
      visitRouteDistanceKm: 57.5,
      factVisitsGpsDistanceKm: 33,
    });
    assert.equal(sel.kind, "fact_visits");
    assert.equal(sel.ineligibleReason, "gps_low_coverage");
  });

  it("GPS-only: tiny snap + no visits → none (no raw/hybrid payout)", () => {
    const sel = selectCompensationFactKind({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 20,
      rawPolylineDistanceKm: 2.3,
      coverageRatio: 0.85,
      snappedTrackDistanceKm: 0.2,
      visitRouteDistanceKm: null,
    });
    assert.equal(sel.kind, "none");
    assert.equal(sel.ineligibleReason, "gps_implausibly_short_vs_visits");
  });

  it("loop collapse with visit line → fact_visits (not hybrid money)", () => {
    const sel = selectCompensationFactKind({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 200,
      rawPolylineDistanceKm: 180,
      coverageRatio: 0.92,
      snappedTrackDistanceKm: 1.4,
      visitRouteDistanceKm: 261,
      factVisitsGpsDistanceKm: 170.5,
      snapFailureReason: "gps_snap_loop_collapse",
    });
    assert.equal(sel.kind, "fact_visits");
    assert.ok(sel.warnings.includes("gps_snap_loop_collapse"));
  });

  it("loop collapse without visits → none", () => {
    const sel = selectCompensationFactKind({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 200,
      rawPolylineDistanceKm: 180,
      coverageRatio: 0.92,
      snappedTrackDistanceKm: 1.4,
      visitRouteDistanceKm: null,
      snapFailureReason: "gps_snap_loop_collapse",
    });
    assert.equal(sel.kind, "none");
    assert.equal(sel.ineligibleReason, "gps_snap_loop_collapse");
  });

  it("isHybridUsableForLoopCollapse still works for map layer helpers", () => {
    assert.equal(
      isHybridUsableForLoopCollapse({
        factVisitsGpsDistanceKm: 1.4,
        rawPolylineDistanceKm: 180,
        visitRouteDistanceKm: 261,
      }),
      false,
    );
    assert.equal(
      isHybridUsableForLoopCollapse({
        factVisitsGpsDistanceKm: 170.5,
        rawPolylineDistanceKm: 180,
        visitRouteDistanceKm: 261,
      }),
      true,
    );
  });

  it("loop symptom without flag + visits → fact_visits", () => {
    const sel = selectCompensationFactKind({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 200,
      rawPolylineDistanceKm: 180,
      coverageRatio: 0.92,
      snappedTrackDistanceKm: 1.4,
      visitRouteDistanceKm: 261,
    });
    assert.equal(sel.kind, "fact_visits");
  });

  it("below MIN track + no visits → none", () => {
    const sel = selectCompensationFactKind({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 2,
      rawPolylineDistanceKm: 0.3,
      coverageRatio: 0.9,
      snappedTrackDistanceKm: 0.3,
      visitRouteDistanceKm: null,
    });
    assert.equal(sel.kind, "none");
    assert.equal(sel.ineligibleReason, "track_too_short");
  });

  it("Gumenyuk: low coverage with usable visits → fact_visits", () => {
    const sel = selectCompensationFactKind({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 180,
      rawPolylineDistanceKm: 18,
      coverageRatio: 0.52,
      snappedTrackDistanceKm: 18,
      visitRouteDistanceKm: 35.1,
    });
    assert.equal(sel.kind, "fact_visits");
    assert.equal(sel.ineligibleReason, "gps_low_coverage");
  });

  it("holey track prefers visits even when GPS km > visits", () => {
    const sel = selectCompensationFactKind({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 40,
      rawPolylineDistanceKm: 40,
      coverageRatio: 0.5,
      snappedTrackDistanceKm: 40,
      visitRouteDistanceKm: 12,
    });
    assert.equal(sel.kind, "fact_visits");
    assert.equal(sel.ineligibleReason, "gps_low_coverage");
  });

  it("contradiction → fact_gps snap, never auto visits", () => {
    const sel = selectCompensationFactKind({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 20,
      rawPolylineDistanceKm: 5.8,
      coverageRatio: 0.4,
      snappedTrackDistanceKm: 2.8,
      visitRouteDistanceKm: 9.7,
      visitTrackContradiction: true,
    });
    assert.equal(sel.kind, "fact_gps");
    assert.equal(sel.ineligibleReason, "visit_track_contradiction");
    assert.ok(sel.warnings.includes("visit_closed_off_address_unconfirmed"));
  });

  it("contradiction without snap → none", () => {
    const sel = selectCompensationFactKind({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 2,
      rawPolylineDistanceKm: 0.2,
      coverageRatio: 0.2,
      snappedTrackDistanceKm: 0.1,
      visitRouteDistanceKm: 9.7,
      visitTrackContradiction: true,
    });
    assert.equal(sel.kind, "none");
    assert.equal(sel.ineligibleReason, "visit_track_contradiction");
  });

  it("whole track → fact_gps", () => {
    const sel = selectCompensationFactKind({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 100,
      rawPolylineDistanceKm: 40,
      coverageRatio: 0.9,
      snappedTrackDistanceKm: 38,
      visitRouteDistanceKm: 42,
    });
    assert.equal(sel.kind, "fact_gps");
    assert.equal(sel.ineligibleReason, null);
  });
});
