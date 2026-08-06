const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  resolveTrackingModeAfterPermissions,
  isBackgroundLocationGranted,
} = require("../location-tracking-start");

describe("location-tracking-start gate", () => {
  it("returns none without background (Always) permission — no silent foreground", () => {
    assert.equal(resolveTrackingModeAfterPermissions("granted", "denied", true), "none");
    assert.equal(resolveTrackingModeAfterPermissions("granted", null, true), "none");
    assert.equal(isBackgroundLocationGranted("denied"), false);
  });

  it("returns none when foreground denied or FGS failed", () => {
    assert.equal(resolveTrackingModeAfterPermissions("denied", "granted", true), "none");
    assert.equal(resolveTrackingModeAfterPermissions("granted", "granted", false), "none");
  });

  it("returns background only with Always + running FGS", () => {
    assert.equal(resolveTrackingModeAfterPermissions("granted", "granted", true), "background");
    assert.equal(isBackgroundLocationGranted("granted"), true);
  });
});
