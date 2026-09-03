import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collectFuelGpsWarnings,
  confirmedPlanVisitIds,
  extraDoneVisitIds,
  selectCompensationPayout,
} from "../field-fuel.payout.util";

const plan8 = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];

describe("confirmedPlanVisitIds / extraDoneVisitIds (informational)", () => {
  it("preserves plan order for confirmed subset", () => {
    assert.deepEqual(confirmedPlanVisitIds(plan8, ["p3", "p1", "x"]), ["p1", "p3"]);
  });

  it("lists DONE outside the plan as extras", () => {
    assert.deepEqual(extraDoneVisitIds(plan8, ["p1", "adhoc"]), ["adhoc"]);
  });
});

describe("selectCompensationPayout v2.2 full plan", () => {
  it("WALK_TRANSIT → none", () => {
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
    assert.equal(r.payoutReason, "none_non_vehicle_day");
    assert.equal(r.ineligibleReason, "non_vehicle_day");
  });

  it("contradiction + valid plan → pay plannedKm, not none", () => {
    const r = selectCompensationPayout({
      mobilityMode: "CAR",
      plannedKm: 34.8,
      plannedDegraded: false,
      plannedSource: "osrm",
      visitRouteKm: 31,
      planVisitIds: ["a", "b", "c"],
      doneVisitIds: ["a", "b", "c"],
      visitTrackContradiction: true,
    });
    assert.equal(r.kind, "planned");
    assert.equal(r.compensationKm, 34.8);
    assert.equal(r.payoutReason, "planned_osrm_full");
  });

  it("extras + visitRouteKm=1047 + plan 20.2 → pay 20.2, not 1047", () => {
    const r = selectCompensationPayout({
      mobilityMode: "CAR",
      plannedKm: 20.2,
      plannedDegraded: false,
      plannedSource: "osrm",
      visitRouteKm: 1047,
      planVisitIds: ["p1", "p2"],
      doneVisitIds: ["p1", "adhoc"],
    });
    assert.equal(r.kind, "planned");
    assert.equal(r.compensationKm, 20.2);
    assert.equal(r.payoutReason, "planned_osrm_full");
  });

  it("1 DONE from N stops → pay full plannedKm, not partialPlanKm", () => {
    const r = selectCompensationPayout({
      mobilityMode: "CAR",
      plannedKm: 119,
      plannedDegraded: false,
      plannedSource: "osrm",
      visitRouteKm: 40,
      planVisitIds: plan8,
      doneVisitIds: ["p1"],
      partialPlanKm: 25,
    });
    assert.equal(r.kind, "planned");
    assert.equal(r.compensationKm, 119);
    assert.equal(r.payoutReason, "planned_osrm_full");
  });

  it("0 DONE + valid plan → pay plannedKm", () => {
    const r = selectCompensationPayout({
      mobilityMode: "CAR",
      plannedKm: 80,
      plannedDegraded: false,
      plannedSource: "osrm",
      visitRouteKm: null,
      planVisitIds: plan8,
      doneVisitIds: [],
    });
    assert.equal(r.kind, "planned");
    assert.equal(r.compensationKm, 80);
    assert.equal(r.payoutReason, "planned_osrm_full");
  });

  it("no plan + visit route → fact_visits", () => {
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

  it("GPS kind is never selected", () => {
    const cases = [
      selectCompensationPayout({
        mobilityMode: "CAR",
        plannedKm: 50,
        plannedDegraded: false,
        plannedSource: "osrm",
        visitRouteKm: 10,
        planVisitIds: ["a"],
        doneVisitIds: ["a"],
      }),
      selectCompensationPayout({
        mobilityMode: "CAR",
        plannedKm: null,
        plannedDegraded: false,
        plannedSource: "none",
        visitRouteKm: 10,
        planVisitIds: [],
        doneVisitIds: ["a"],
      }),
      selectCompensationPayout({
        mobilityMode: "CAR",
        plannedKm: null,
        plannedDegraded: false,
        plannedSource: "none",
        visitRouteKm: null,
        planVisitIds: [],
        doneVisitIds: [],
      }),
    ];
    for (const r of cases) {
      assert.notEqual((r.kind as string), "fact_gps");
      assert.ok(r.kind === "planned" || r.kind === "fact_visits" || r.kind === "none");
    }
  });

  it("fallback / degraded plan falls back to fact_visits", () => {
    const fallback = selectCompensationPayout({
      mobilityMode: "CAR",
      plannedKm: 119,
      plannedDegraded: false,
      plannedSource: "fallback",
      visitRouteKm: 26.5,
      planVisitIds: ["v1"],
      doneVisitIds: ["v1"],
    });
    assert.equal(fallback.kind, "fact_visits");
    assert.equal(fallback.compensationKm, 26.5);

    const degraded = selectCompensationPayout({
      mobilityMode: "CAR",
      plannedKm: 5289,
      plannedDegraded: true,
      plannedSource: "osrm",
      visitRouteKm: 20,
      planVisitIds: ["v1"],
      doneVisitIds: ["v1"],
    });
    assert.equal(degraded.kind, "fact_visits");
    assert.equal(degraded.compensationKm, 20);
  });
});

describe("collectFuelGpsWarnings", () => {
  it("contradiction and loop collapse are warnings only", () => {
    const w = collectFuelGpsWarnings({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 800,
      rawPolylineDistanceKm: 140,
      coverageRatio: 0.9,
      snappedTrackDistanceKm: 68.9,
      visitRouteDistanceKm: 119,
      snapFailureReason: "gps_snap_loop_collapse",
      visitTrackContradiction: true,
    });
    assert.ok(w.includes("gps_snap_loop_collapse"));
    assert.ok(w.includes("visit_closed_off_address_unconfirmed"));
  });
});
