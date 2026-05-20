import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveRouteGeometry, type RouteAnchorConfig } from "../route-geometry";

const v1 = { lat: 50.1, lng: 30.1 };
const v2 = { lat: 50.2, lng: 30.2 };
const v3 = { lat: 50.3, lng: 30.3 };
const home = { lat: 50.0, lng: 30.0 };
const office = { lat: 50.9, lng: 30.9 };

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

  it("with start only round-trips through all visits", () => {
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
