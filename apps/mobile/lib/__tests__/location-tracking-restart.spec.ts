const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  reconcileTrackingHealth,
  shouldRestartBackgroundTask,
} = require("../location-tracking-health");

describe("shouldRestartBackgroundTask", () => {
  it("returns true when storage says background but OS task is dead", () => {
    assert.equal(shouldRestartBackgroundTask("background", false), true);
  });

  it("returns false when background task is running", () => {
    assert.equal(shouldRestartBackgroundTask("background", true), false);
  });

  it("returns false for foreground or none modes", () => {
    assert.equal(shouldRestartBackgroundTask("foreground", false), false);
    assert.equal(shouldRestartBackgroundTask("none", false), false);
  });
});

describe("restart decision aligns with reconcileTrackingHealth", () => {
  it("shouldRestartBackground matches shouldRestartBackgroundTask", () => {
    const health = reconcileTrackingHealth("background", false, false);
    assert.equal(health.shouldRestartBackground, shouldRestartBackgroundTask("background", false));
    assert.equal(health.shouldRestartBackground, true);
  });

  it("healthy background task does not need restart", () => {
    const health = reconcileTrackingHealth("background", true, false);
    assert.equal(shouldRestartBackgroundTask("background", true), false);
    assert.equal(health.shouldRestartBackground, false);
    assert.equal(health.healthy, true);
  });
});
