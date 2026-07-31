const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  reconcileTrackingHealth,
  isAcceptStale,
  LAST_ACCEPT_STALE_MS,
} = require("../location-tracking-health");

describe("reconcileTrackingHealth", () => {
  it("flags unhealthy when storage says background but OS task is dead", () => {
    const health = reconcileTrackingHealth("background", false, false, {
      requireRecentAccept: false,
    });
    assert.equal(health.healthy, false);
    assert.equal(health.shouldRestartBackground, true);
    assert.equal(health.actualMode, "none");
  });

  it("expects startLocationTracking when shouldRestartBackground", () => {
    const health = reconcileTrackingHealth("background", false, false, {
      requireRecentAccept: false,
    });
    assert.equal(health.claimedMode, "background");
    assert.equal(health.shouldRestartBackground, true);
  });

  it("is healthy when background task matches claimed mode and accept is fresh", () => {
    const now = Date.parse("2026-07-31T12:00:00.000Z");
    const health = reconcileTrackingHealth("background", true, false, {
      lastAcceptedAt: new Date(now - 60_000).toISOString(),
      nowMs: now,
      requireRecentAccept: true,
    });
    assert.equal(health.healthy, true);
    assert.equal(health.acceptStale, false);
    assert.equal(health.actualMode, "background");
    assert.equal(health.shouldRestartBackground, false);
  });

  it("Isanchev: native alive but no accept → unhealthy", () => {
    const now = Date.parse("2026-07-31T12:00:00.000Z");
    const health = reconcileTrackingHealth("background", true, false, {
      lastAcceptedAt: new Date(now - LAST_ACCEPT_STALE_MS - 1).toISOString(),
      nowMs: now,
      requireRecentAccept: true,
    });
    assert.equal(health.acceptStale, true);
    assert.equal(health.healthy, false);
  });

  it("is unhealthy when foreground watch is missing", () => {
    const health = reconcileTrackingHealth("foreground", false, false, {
      requireRecentAccept: false,
    });
    assert.equal(health.healthy, false);
    assert.equal(health.actualMode, "none");
  });

  it("is healthy when foreground subscription is active", () => {
    const now = Date.parse("2026-07-31T12:00:00.000Z");
    const health = reconcileTrackingHealth("foreground", false, true, {
      lastAcceptedAt: new Date(now - 30_000).toISOString(),
      nowMs: now,
    });
    assert.equal(health.healthy, true);
    assert.equal(health.actualMode, "foreground");
  });

  it("treats running background task as actual mode over stale foreground claim", () => {
    const now = Date.parse("2026-07-31T12:00:00.000Z");
    const health = reconcileTrackingHealth("foreground", true, true, {
      lastAcceptedAt: new Date(now).toISOString(),
      nowMs: now,
    });
    assert.equal(health.actualMode, "background");
    assert.equal(health.healthy, true);
  });
});

describe("isAcceptStale", () => {
  it("treats missing accept as stale", () => {
    assert.equal(isAcceptStale(null), true);
    assert.equal(isAcceptStale(undefined), true);
  });

  it("fresh accept is not stale", () => {
    const now = Date.now();
    assert.equal(isAcceptStale(new Date(now - 60_000).toISOString(), now), false);
  });
});
