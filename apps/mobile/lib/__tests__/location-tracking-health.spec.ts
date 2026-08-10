const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  reconcileTrackingHealth,
  isAcceptStale,
  isPointStale,
  LAST_ACCEPT_STALE_MS,
  LAST_POINT_STALE_MS,
  resolveTrackingUnhealthyReason,
  unhealthyReasonMessageKeys,
  deriveTrackingHealthKind,
} = require("../location-tracking-health");

describe("reconcileTrackingHealth", () => {
  it("flags unhealthy when storage says background but OS task is dead", () => {
    const health = reconcileTrackingHealth("background", false, false, {
      requireRecentAccept: false,
    });
    assert.equal(health.healthy, false);
    assert.equal(health.shouldRestartBackground, true);
    assert.equal(health.actualMode, "none");
    assert.equal(health.healthKind, "task_dead");
  });

  it("expects startLocationTracking when shouldRestartBackground", () => {
    const health = reconcileTrackingHealth("background", false, false, {
      requireRecentAccept: false,
    });
    assert.equal(health.claimedMode, "background");
    assert.equal(health.shouldRestartBackground, true);
  });

  it("is healthy when task registered and accept + point are fresh", () => {
    const now = Date.parse("2026-07-31T12:00:00.000Z");
    const fresh = new Date(now - 60_000).toISOString();
    const health = reconcileTrackingHealth("background", true, false, {
      lastAcceptedAt: fresh,
      lastGpsPointAt: fresh,
      nowMs: now,
      requireRecentAccept: true,
      backgroundPermission: "granted",
    });
    assert.equal(health.healthy, true);
    assert.equal(health.acceptStale, false);
    assert.equal(health.pointStale, false);
    assert.equal(health.healthKind, "healthy");
    assert.equal(health.zombieFgs, false);
    assert.equal(health.actualMode, "background");
    assert.equal(health.shouldRestartBackground, false);
  });

  it("hasStarted alone is NOT healthy when accept is stale (zombie FGS)", () => {
    const now = Date.parse("2026-07-31T12:00:00.000Z");
    const health = reconcileTrackingHealth("background", true, false, {
      lastAcceptedAt: new Date(now - LAST_ACCEPT_STALE_MS - 1).toISOString(),
      lastGpsPointAt: new Date(now - LAST_ACCEPT_STALE_MS - 1).toISOString(),
      nowMs: now,
      requireRecentAccept: true,
      backgroundPermission: "granted",
    });
    assert.equal(health.acceptStale, true);
    assert.equal(health.healthy, false);
    assert.equal(health.zombieFgs, true);
    assert.equal(health.healthKind, "zombie_fgs");
  });

  it("Isanchev ACTIVE+0 samples: null lastAcceptedAt → stale / unhealthy / not zombie without task", () => {
    const health = reconcileTrackingHealth("background", true, false, {
      lastAcceptedAt: null,
      lastGpsPointAt: null,
      requireRecentAccept: true,
      backgroundPermission: "granted",
    });
    assert.equal(health.acceptStale, true);
    assert.equal(health.pointStale, true);
    assert.equal(health.healthy, false);
    assert.equal(health.zombieFgs, true);
  });

  it("point stale alone prevents healthy even when accept fresh", () => {
    const now = Date.parse("2026-07-31T12:00:00.000Z");
    const health = reconcileTrackingHealth("background", true, false, {
      lastAcceptedAt: new Date(now - 60_000).toISOString(),
      lastGpsPointAt: new Date(now - LAST_POINT_STALE_MS - 1).toISOString(),
      nowMs: now,
      requireRecentAccept: true,
      backgroundPermission: "granted",
    });
    assert.equal(health.acceptFresh, true);
    assert.equal(health.pointStale, true);
    assert.equal(health.healthy, false);
    assert.equal(health.zombieFgs, false);
    assert.equal(health.healthKind, "point_stale");
  });

  it("is unhealthy when foreground watch is missing", () => {
    const health = reconcileTrackingHealth("foreground", false, false, {
      requireRecentAccept: false,
    });
    assert.equal(health.healthy, false);
    assert.equal(health.actualMode, "none");
  });

  it("foreground-only mode is always unhealthy (no silent foreground tracking)", () => {
    const now = Date.parse("2026-07-31T12:00:00.000Z");
    const fresh = new Date(now - 30_000).toISOString();
    const health = reconcileTrackingHealth("foreground", false, true, {
      lastAcceptedAt: fresh,
      lastGpsPointAt: fresh,
      nowMs: now,
      backgroundPermission: "granted",
    });
    assert.equal(health.healthy, false);
    assert.equal(health.actualMode, "foreground");
    assert.equal(health.healthKind, "foreground_only");
  });

  it("background without Always permission is unhealthy", () => {
    const health = reconcileTrackingHealth("background", true, false, {
      requireRecentAccept: false,
      backgroundPermission: "denied",
    });
    assert.equal(health.healthy, false);
    assert.equal(health.healthKind, "no_permission");
  });

  it("treats running background task as actual mode over stale foreground claim", () => {
    const now = Date.parse("2026-07-31T12:00:00.000Z");
    const fresh = new Date(now).toISOString();
    const health = reconcileTrackingHealth("foreground", true, true, {
      lastAcceptedAt: fresh,
      lastGpsPointAt: fresh,
      nowMs: now,
      backgroundPermission: "granted",
    });
    assert.equal(health.actualMode, "background");
    assert.equal(health.healthy, false);
  });
});

describe("isAcceptStale / isPointStale", () => {
  it("treats missing accept as stale", () => {
    assert.equal(isAcceptStale(null), true);
    assert.equal(isAcceptStale(undefined), true);
  });

  it("treats missing point as stale", () => {
    assert.equal(isPointStale(null), true);
  });

  it("fresh accept and point are not stale", () => {
    const now = Date.now();
    assert.equal(isAcceptStale(new Date(now - 60_000).toISOString(), now), false);
    assert.equal(isPointStale(new Date(now - 60_000).toISOString(), now), false);
  });
});

describe("deriveTrackingHealthKind", () => {
  it("classifies zombie FGS", () => {
    assert.equal(
      deriveTrackingHealthKind({
        claimedMode: "background",
        taskRegistered: true,
        acceptFresh: false,
        pointFresh: false,
        acceptStale: true,
        pointStale: true,
        backgroundPermission: "granted",
      }),
      "zombie_fgs",
    );
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
        pointStale: false,
        backgroundPermission: "granted",
      }),
      "none",
    );
  });

  it("maps zombie FGS when task started but accept stale", () => {
    assert.equal(
      resolveTrackingUnhealthyReason({
        healthy: false,
        claimedMode: "background",
        backgroundTaskStarted: true,
        foregroundWatchActive: false,
        acceptStale: true,
        zombieFgs: true,
        backgroundPermission: "granted",
      }),
      "zombie_fgs",
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

  it("maps fgs_start_blocked_background when flagged", () => {
    assert.equal(
      resolveTrackingUnhealthyReason({
        healthy: false,
        claimedMode: "background",
        backgroundTaskStarted: false,
        foregroundWatchActive: false,
        acceptStale: false,
        backgroundPermission: "granted",
        fgsRestartBlocked: true,
      }),
      "fgs_start_blocked_background",
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
