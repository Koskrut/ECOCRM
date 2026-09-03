import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collectFuelGpsWarnings,
  confirmedPlanVisitIds,
  extraDoneVisitIds,
  selectCompensationPayout,
} from "../field-fuel.payout.util";

const plan8 = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];

describe("confirmedPlanVisitIds / extraDoneVisitIds", () => {
  it("preserves plan order for confirmed subset", () => {
    assert.deepEqual(confirmedPlanVisitIds(plan8, ["p3", "p1", "x"]), ["p1", "p3"]);
  });

  it("lists DONE outside the plan as extras", () => {
    assert.deepEqual(extraDoneVisitIds(plan8, ["p1", "adhoc"]), ["adhoc"]);
  });
});

describe("selectCompensationPayout stop-share", () => {
  it("WALK_TRANSIT → none even with a valid plan", () => {
    const r = selectCompensationPayout({
      mobilityMode: "WALK_TRANSIT",
      plannedKm: 119,
      plannedDegraded: false,
      plannedSource: "osrm",
      visitRouteKm: 119,
      planVisitIds: ["a"],
      doneVisitIds: ["a"],
    });
    assert.equal(r.kind, "none");
    assert.equal(r.compensationKm, null);
    assert.equal(r.ineligibleReason, "non_vehicle_day");
  });

  it("0 DONE + plan → none", () => {
    const r = selectCompensationPayout({
      mobilityMode: "CAR",
      plannedKm: 80,
      plannedDegraded: false,
      plannedSource: "osrm",
      visitRouteKm: null,
      planVisitIds: plan8,
      doneVisitIds: [],
    });
    assert.equal(r.kind, "none");
    assert.equal(r.compensationKm, null);
    assert.equal(r.ineligibleReason, "plan_without_completed_visits");
    assert.ok(r.warnings.includes("plan_without_completed_visits"));
  });

  it("8/8 plan DONE, no extras → full planned km", () => {
    const r = selectCompensationPayout({
      mobilityMode: "CAR",
      plannedKm: 119,
      plannedDegraded: false,
      plannedSource: "osrm",
      visitRouteKm: 100,
      planVisitIds: plan8,
      doneVisitIds: [...plan8],
      partialPlanKm: 40,
    });
    assert.equal(r.kind, "planned");
    assert.equal(r.compensationKm, 119);
    assert.equal(r.payoutReason, "planned_osrm_complete");
    assert.equal(r.confirmedStopCount, 8);
    assert.equal(r.planStopCount, 8);
  });

  it("Gribovsky 26.08 single plan stop DONE → full round-trip plan", () => {
    const r = selectCompensationPayout({
      mobilityMode: "CAR",
      plannedKm: 119,
      plannedDegraded: false,
      plannedSource: "osrm",
      visitRouteKm: 119,
      planVisitIds: ["v1"],
      doneVisitIds: ["v1"],
    });
    assert.equal(r.kind, "planned");
    assert.equal(r.compensationKm, 119);
    assert.equal(r.payoutReason, "planned_osrm_complete");
  });

  it("3/8 confirmed, no extras, partial OSRM 40 → planned 40 (not 119, not 3/8*119)", () => {
    const r = selectCompensationPayout({
      mobilityMode: "CAR",
      plannedKm: 119,
      plannedDegraded: false,
      plannedSource: "osrm",
      visitRouteKm: 50,
      planVisitIds: plan8,
      doneVisitIds: ["p1", "p2", "p3"],
      partialPlanKm: 40,
    });
    assert.equal(r.kind, "planned");
    assert.equal(r.compensationKm, 40);
    assert.equal(r.payoutReason, "planned_osrm_partial=3/8");
    assert.equal(r.confirmedStopCount, 3);
  });

  it("extras (adhoc) → fact_visits even if plan exists", () => {
    const r = selectCompensationPayout({
      mobilityMode: "CAR",
      plannedKm: 119,
      plannedDegraded: false,
      plannedSource: "osrm",
      visitRouteKm: 26.5,
      planVisitIds: plan8,
      doneVisitIds: ["p1", "adhoc"],
      partialPlanKm: 20,
    });
    assert.equal(r.kind, "fact_visits");
    assert.equal(r.compensationKm, 26.5);
    assert.equal(r.payoutReason, "fact_visits_extras");
  });

  it("no plan → fact_visits 26.5", () => {
    const r = selectCompensationPayout({
      mobilityMode: "CAR",
      plannedKm: null,
      plannedDegraded: false,
      plannedSource: "none",
      visitRouteKm: 26.5,
      planVisitIds: [],
      doneVisitIds: ["a", "b"],
    });
    assert.equal(r.kind, "fact_visits");
    assert.equal(r.compensationKm, 26.5);
    assert.equal(r.payoutReason, "fact_visits_no_plan");
  });

  it("contradiction → none (manual review)", () => {
    const r = selectCompensationPayout({
      mobilityMode: "CAR",
      plannedKm: 119,
      plannedDegraded: false,
      plannedSource: "osrm",
      visitRouteKm: 119,
      planVisitIds: ["v1"],
      doneVisitIds: ["v1"],
      visitTrackContradiction: true,
    });
    assert.equal(r.kind, "none");
    assert.equal(r.compensationKm, null);
    assert.equal(r.ineligibleReason, "visit_track_contradiction");
    assert.ok(r.warnings.includes("visit_closed_off_address_unconfirmed"));
  });

  it("haversine/fallback plan is not paid — visits instead", () => {
    const r = selectCompensationPayout({
      mobilityMode: "CAR",
      plannedKm: 119,
      plannedDegraded: false,
      plannedSource: "fallback",
      visitRouteKm: 26.5,
      planVisitIds: ["v1"],
      doneVisitIds: ["v1"],
    });
    assert.equal(r.kind, "fact_visits");
    assert.equal(r.compensationKm, 26.5);
  });

  it("degraded plan (insane km) falls back to fact_visits", () => {
    const r = selectCompensationPayout({
      mobilityMode: "CAR",
      plannedKm: 5289,
      plannedDegraded: true,
      plannedSource: "osrm",
      visitRouteKm: 20,
      planVisitIds: ["v1", "v2"],
      doneVisitIds: ["v1", "v2"],
    });
    assert.equal(r.kind, "fact_visits");
    assert.equal(r.compensationKm, 20);
  });

  it("Gumenyuk full day: all plan DONE → full plan km", () => {
    for (const plannedKm of [34.8, 47.3, 43.4, 34.3]) {
      const ids = ["a", "b", "c"];
      const r = selectCompensationPayout({
        mobilityMode: "CAR",
        plannedKm,
        plannedDegraded: false,
        plannedSource: "osrm",
        visitRouteKm: 31,
        planVisitIds: ids,
        doneVisitIds: ids,
      });
      assert.equal(r.kind, "planned");
      assert.equal(r.compensationKm, plannedKm);
      assert.equal(r.payoutReason, "planned_osrm_complete");
    }
  });

  it("partial without usable subset OSRM → fact_visits", () => {
    const r = selectCompensationPayout({
      mobilityMode: "CAR",
      plannedKm: 119,
      plannedDegraded: false,
      plannedSource: "osrm",
      visitRouteKm: 50,
      planVisitIds: plan8,
      doneVisitIds: ["p1", "p2"],
      partialPlanKm: null,
    });
    assert.equal(r.kind, "fact_visits");
    assert.equal(r.compensationKm, 50);
    assert.equal(r.payoutReason, "fact_visits_partial_osrm_failed");
  });

  it("requiresDoneVisit=false with empty DONE still allows complete plan path only via plan ids", () => {
    // With zero DONE, confirmed is empty — even with requiresDoneVisit false we need DONE for plan∩DONE.
    // Flag only skips the early "0 DONE → none" gate; without confirmed stops we fall to visits/none.
    const r = selectCompensationPayout({
      mobilityMode: "CAR",
      plannedKm: 80,
      plannedDegraded: false,
      plannedSource: "osrm",
      visitRouteKm: null,
      planVisitIds: plan8,
      doneVisitIds: [],
      requiresDoneVisit: false,
    });
    assert.equal(r.kind, "none");
  });
});

describe("collectFuelGpsWarnings", () => {
  it("loop collapse is informational, does not imply payout kind", () => {
    const w = collectFuelGpsWarnings({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 800,
      rawPolylineDistanceKm: 140,
      coverageRatio: 0.9,
      snappedTrackDistanceKm: 68.9,
      visitRouteDistanceKm: 119,
      snapFailureReason: "gps_snap_loop_collapse",
    });
    assert.ok(w.includes("gps_snap_loop_collapse"));
  });
});
