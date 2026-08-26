import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SHIFT_HOME_NEAR_M,
  isNearHome,
  suggestDestinationKind,
  suggestOriginKind,
} from "../field-shift-anchors.util";

const home = { lat: 50.45, lng: 30.52 };

describe("field-shift-anchors", () => {
  it("SHIFT_HOME_NEAR_M is 1 km", () => {
    assert.equal(SHIFT_HOME_NEAR_M, 1000);
  });

  it("suggestOriginKind: GPS near garage → HOME", () => {
    const near = { lat: 50.4505, lng: 30.5205 };
    assert.equal(suggestOriginKind(near, home), "HOME");
    assert.equal(isNearHome(near, home), true);
  });

  it("suggestOriginKind: GPS far → CURRENT", () => {
    const far = { lat: 50.5, lng: 30.6 };
    assert.equal(suggestOriginKind(far, home), "CURRENT");
    assert.equal(isNearHome(far, home), false);
  });

  it("suggestDestinationKind: last GPS near garage → HOME", () => {
    const near = { lat: 50.4502, lng: 30.5201 };
    assert.equal(suggestDestinationKind(near, home), "HOME");
  });

  it("suggestDestinationKind: far → CURRENT", () => {
    const far = { lat: 49.8, lng: 30.1 };
    assert.equal(suggestDestinationKind(far, home), "CURRENT");
  });

  it("no GPS + garage → HOME default", () => {
    assert.equal(suggestOriginKind(null, home), "HOME");
    assert.equal(suggestDestinationKind(null, home), "HOME");
  });
});
