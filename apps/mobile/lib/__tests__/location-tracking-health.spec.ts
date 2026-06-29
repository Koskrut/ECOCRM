const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { reconcileTrackingHealth } = require("../location-tracking-health");

describe("reconcileTrackingHealth", () => {
  it("flags unhealthy when storage says background but OS task is dead", () => {
    const health = reconcileTrackingHealth("background", false, false);
    assert.equal(health.healthy, false);
    assert.equal(health.shouldRestartBackground, true);
    assert.equal(health.actualMode, "none");
  });

  it("expects startLocationTracking when shouldRestartBackground", () => {
    const health = reconcileTrackingHealth("background", false, false);
    assert.equal(health.claimedMode, "background");
    assert.equal(health.shouldRestartBackground, true);
  });

  it("is healthy when background task matches claimed mode", () => {
    const health = reconcileTrackingHealth("background", true, false);
    assert.equal(health.healthy, true);
    assert.equal(health.actualMode, "background");
    assert.equal(health.shouldRestartBackground, false);
  });

  it("is unhealthy when foreground watch is missing", () => {
    const health = reconcileTrackingHealth("foreground", false, false);
    assert.equal(health.healthy, false);
    assert.equal(health.actualMode, "none");
  });

  it("is healthy when foreground subscription is active", () => {
    const health = reconcileTrackingHealth("foreground", false, true);
    assert.equal(health.healthy, true);
    assert.equal(health.actualMode, "foreground");
  });

  it("treats running background task as actual mode over stale foreground claim", () => {
    const health = reconcileTrackingHealth("foreground", true, true);
    assert.equal(health.actualMode, "background");
    assert.equal(health.healthy, true);
  });
});
