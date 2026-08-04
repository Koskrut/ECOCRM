const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  reconcileTrackingHealth,
  isAcceptStale,
  LAST_ACCEPT_STALE_MS,
  resolveTrackingUnhealthyReason,
  unhealthyReasonMessageKeys,
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

  it("Isanchev ACTIVE+0 samples: null lastAcceptedAt → stale / unhealthy", () => {
    const health = reconcileTrackingHealth("background", true, false, {
      lastAcceptedAt: null,
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

describe("resolveTrackingUnhealthyReason", () => {
  it("returns none when healthy and not accept-stale", () => {
    assert.equal(
      resolveTrackingUnhealthyReason({
        healthy: true,
        claimedMode: "background",
        backgroundTaskStarted: true,
        foregroundWatchActive: false,
        acceptStale: false,
        backgroundPermission: "granted",
      }),
      "none",
    );
  });

  it("prefers background permission over dead task", () => {
    assert.equal(
      resolveTrackingUnhealthyReason({
        healthy: false,
        claimedMode: "background",
        backgroundTaskStarted: false,
        foregroundWatchActive: false,
        acceptStale: true,
        backgroundPermission: "denied",
      }),
      "background_permission",
    );
  });

  it("maps dead background task (not battery)", () => {
    assert.equal(
      resolveTrackingUnhealthyReason({
        healthy: false,
        claimedMode: "background",
        backgroundTaskStarted: false,
        foregroundWatchActive: false,
        acceptStale: false,
        backgroundPermission: "granted",
      }),
      "background_task_dead",
    );
  });

  it("maps accept_stale wrong_day / auth_401", () => {
    assert.equal(
      resolveTrackingUnhealthyReason({
        healthy: false,
        claimedMode: "background",
        backgroundTaskStarted: true,
        foregroundWatchActive: false,
        acceptStale: true,
        backgroundPermission: "granted",
        flushBlockReason: "wrong_day",
      }),
      "accept_stale_wrong_day",
    );
    assert.equal(
      resolveTrackingUnhealthyReason({
        healthy: false,
        claimedMode: "background",
        backgroundTaskStarted: true,
        foregroundWatchActive: false,
        acceptStale: true,
        backgroundPermission: "granted",
        flushBlockReason: "auth_401",
      }),
      "accept_stale_auth_401",
    );
  });

  it("message keys for task-dead never mention battery path", () => {
    const keys = unhealthyReasonMessageKeys("background_task_dead");
    assert.ok(keys);
    assert.equal(keys.titleKey, "gps.backgroundTaskDeadTitle");
    assert.equal(keys.bodyKey, "gps.backgroundTaskDeadHint");
    assert.notEqual(keys.bodyKey, "gps.batteryHint");
    assert.notEqual(keys.titleKey, "gps.trackingUnhealthy");
  });
});
