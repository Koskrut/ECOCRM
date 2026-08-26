import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveRouteGeometry,
  resolveFactRouteGeometry,
  type RouteAnchorConfig,
  type ShiftDayAnchors,
} from "../route-geometry";

const v1 = { lat: 50.1, lng: 30.1 };
const v2 = { lat: 50.2, lng: 30.2 };
const v3 = { lat: 50.3, lng: 30.3 };
const home = { lat: 50.0, lng: 30.0 };
const office = { lat: 50.9, lng: 30.9 };
const fieldStart = { lat: 50.05, lng: 30.05 };

describe("resolveRouteGeometry", () => {
  it("without anchors uses first and last visit", () => {
    const anchors: RouteAnchorConfig = {
      origin: null,
      destination: null,
      hasExplicitStart: false,
      hasExplicitEnd: false,
      startLabel: null,
      endLabel: null,
    };
    const r = resolveRouteGeometry([v1, v2, v3], anchors);
    assert.equal(r.usesSettingsAnchors, false);
    assert.deepEqual(r.origin, v1);
    assert.deepEqual(r.destination, v3);
    assert.deepEqual(r.intermediates, [v2]);
  });

  it("with start and end uses settings endpoints and all visits as intermediates", () => {
    const anchors: RouteAnchorConfig = {
      origin: home,
      destination: office,
      hasExplicitStart: true,
      hasExplicitEnd: true,
      startLabel: "Дім",
      endLabel: "Офіс",
    };
    const r = resolveRouteGeometry([v1, v2, v3], anchors);
    assert.equal(r.usesSettingsAnchors, true);
    assert.deepEqual(r.origin, home);
    assert.deepEqual(r.destination, office);
    assert.deepEqual(r.intermediates, [v1, v2, v3]);
  });

  it("with start only round-trips through all visits (planned)", () => {
    const anchors: RouteAnchorConfig = {
      origin: home,
      destination: home,
      hasExplicitStart: true,
      hasExplicitEnd: false,
      startLabel: "Дім",
      endLabel: null,
    };
    const r = resolveRouteGeometry([v1, v2], anchors);
    assert.deepEqual(r.origin, home);
    assert.deepEqual(r.destination, home);
    assert.deepEqual(r.intermediates, [v1, v2]);
  });

  it("with end only routes from first visit to end anchor", () => {
    const anchors: RouteAnchorConfig = {
      origin: null,
      destination: office,
      hasExplicitStart: false,
      hasExplicitEnd: true,
      startLabel: null,
      endLabel: "Офіс",
    };
    const r = resolveRouteGeometry([v1, v2, v3], anchors);
    assert.deepEqual(r.origin, v1);
    assert.deepEqual(r.destination, office);
    assert.deepEqual(r.intermediates, [v2, v3]);
  });
});

describe("resolveFactRouteGeometry", () => {
  it("1 visit + origin → line without return home while ACTIVE", () => {
    const shift: ShiftDayAnchors = {
      origin: home,
      destination: null,
      hasDestination: false,
    };
    const r = resolveFactRouteGeometry([v1], shift);
    assert.ok(r);
    assert.deepEqual(r!.origin, home);
    assert.deepEqual(r!.destination, v1);
    assert.deepEqual(r!.intermediates, []);
  });

  it("ACTIVE multi-visit ends at last visit (no garage return)", () => {
    const shift: ShiftDayAnchors = {
      origin: fieldStart,
      destination: null,
      hasDestination: false,
    };
    const r = resolveFactRouteGeometry([v1, v2, v3], shift);
    assert.ok(r);
    assert.deepEqual(r!.origin, fieldStart);
    assert.deepEqual(r!.destination, v3);
    assert.deepEqual(r!.intermediates, [v1, v2]);
  });

  it("ENDED + destination HOME adds return arc", () => {
    const shift: ShiftDayAnchors = {
      origin: home,
      destination: home,
      hasDestination: true,
    };
    const r = resolveFactRouteGeometry([v1, v2], shift);
    assert.ok(r);
    assert.deepEqual(r!.origin, home);
    assert.deepEqual(r!.destination, home);
    assert.deepEqual(r!.intermediates, [v1, v2]);
  });

  it("CURRENT origin far from home does not glue garage", () => {
    const shift: ShiftDayAnchors = {
      origin: fieldStart,
      destination: null,
      hasDestination: false,
    };
    const r = resolveFactRouteGeometry([v1], shift);
    assert.ok(r);
    assert.deepEqual(r!.origin, fieldStart);
    assert.notDeepEqual(r!.origin, home);
  });

  it("missing shift origin → null (do not substitute first visit)", () => {
    const shift: ShiftDayAnchors = {
      origin: null,
      destination: null,
      hasDestination: false,
    };
    assert.equal(resolveFactRouteGeometry([v1, v2], shift), null);
  });
});
