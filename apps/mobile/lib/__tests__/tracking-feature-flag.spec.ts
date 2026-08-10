const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  resolveFieldTrackingMode,
  shouldUseExpoTracking,
  shouldUseNativeTracking,
} = require("../tracking-feature-flag-core");

describe("resolveFieldTrackingMode", () => {
  it("defaults to legacy_expo", () => {
    assert.equal(resolveFieldTrackingMode(), "legacy_expo");
    assert.equal(shouldUseExpoTracking(), true);
    assert.equal(shouldUseNativeTracking(), false);
  });

  it("selects native_android from env", () => {
    assert.equal(resolveFieldTrackingMode("native_android"), "native_android");
    assert.equal(
      resolveFieldTrackingMode(undefined, { fieldTrackingMode: "native_android" }),
      "native_android",
    );
  });
});
