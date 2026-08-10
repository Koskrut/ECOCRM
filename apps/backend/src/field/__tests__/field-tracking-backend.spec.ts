import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isValidFieldTrackingMode,
  resolveFieldTrackingMode,
  shouldUseExpoTracking,
  shouldUseNativeTracking,
} from "../field-tracking-backend";

describe("resolveFieldTrackingMode", () => {
  it("defaults to legacy_expo", () => {
    assert.equal(resolveFieldTrackingMode(), "legacy_expo");
    assert.equal(resolveFieldTrackingMode(undefined, {}), "legacy_expo");
  });

  it("selects native_android from env", () => {
    assert.equal(resolveFieldTrackingMode("native_android"), "native_android");
    assert.equal(
      resolveFieldTrackingMode(undefined, { FIELD_TRACKING_MODE: "native_android" }),
      "native_android",
    );
  });

  it("validates known modes", () => {
    assert.equal(isValidFieldTrackingMode("legacy_expo"), true);
    assert.equal(isValidFieldTrackingMode("native_android"), true);
    assert.equal(isValidFieldTrackingMode("expo"), false);
  });
});

describe("shouldUseNativeTracking / shouldUseExpoTracking", () => {
  it("native only when flag set", () => {
    assert.equal(shouldUseNativeTracking("legacy_expo"), false);
    assert.equal(shouldUseNativeTracking("native_android"), true);
    assert.equal(shouldUseExpoTracking("legacy_expo"), true);
    assert.equal(shouldUseExpoTracking("native_android"), false);
  });
});
