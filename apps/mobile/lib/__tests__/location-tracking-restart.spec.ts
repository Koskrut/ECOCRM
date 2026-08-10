const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  reconcileTrackingHealth,
  shouldRestartBackgroundTask,
} = require("../location-tracking-health");
const {
  RESTART_COOLDOWN_MS,
  canRestartNow,
  canStartLocationForegroundService,
  isFgsBlockedFromBackgroundError,
  mapRestartContextToReason,
  reportedModeAfterBackgroundRestartAttempt,
  shouldMaintainOnAppState,
  shouldPromptBatteryForRestarts,
} = require("../location-tracking-restart");

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
    const health = reconcileTrackingHealth("background", false, false, {
      requireRecentAccept: false,
    });
    assert.equal(health.shouldRestartBackground, shouldRestartBackgroundTask("background", false));
    assert.equal(health.shouldRestartBackground, true);
  });

  it("healthy background task does not need restart", () => {
    const now = Date.now();
    const fresh = new Date(now).toISOString();
    const health = reconcileTrackingHealth("background", true, false, {
      lastAcceptedAt: fresh,
      lastGpsPointAt: fresh,
      nowMs: now,
      backgroundPermission: "granted",
    });
    assert.equal(shouldRestartBackgroundTask("background", true), false);
    assert.equal(health.shouldRestartBackground, false);
    assert.equal(health.healthy, true);
  });
});

describe("shouldMaintainOnAppState", () => {
  it("only maintains on background, not inactive", () => {
    assert.equal(shouldMaintainOnAppState("background"), true);
    assert.equal(shouldMaintainOnAppState("inactive"), false);
    assert.equal(shouldMaintainOnAppState("active"), false);
  });
});

describe("canStartLocationForegroundService", () => {
  it("allows FGS start only while app is active", () => {
    assert.equal(canStartLocationForegroundService("active"), true);
    assert.equal(canStartLocationForegroundService("background"), false);
    assert.equal(canStartLocationForegroundService("inactive"), false);
  });
});

describe("reportedModeAfterBackgroundRestartAttempt", () => {
  it("does not fake background when OS task is still dead (cooldown lie)", () => {
    assert.equal(reportedModeAfterBackgroundRestartAttempt("background", false), "none");
  });

  it("reports background only when task actually started", () => {
    assert.equal(reportedModeAfterBackgroundRestartAttempt("background", true), "background");
  });
});

describe("isFgsBlockedFromBackgroundError", () => {
  it("detects Android FGS-from-background rejection", () => {
    assert.equal(
      isFgsBlockedFromBackgroundError(
        "ExpoLocation.startLocationUpdatesAsync rejected: Couldn't start the foreground service. Foreground service cannot be started when the application is in the background",
      ),
      true,
    );
    assert.equal(isFgsBlockedFromBackgroundError("network timeout"), false);
  });
});

describe("restart cooldown", () => {
  it("blocks restart inside cooldown window", () => {
    const { _setLastRestartAtForTests } = require("../location-tracking-restart");
    const now = 1_000_000;
    _setLastRestartAtForTests(now);
    assert.equal(canRestartNow(now + RESTART_COOLDOWN_MS - 1), false);
    assert.equal(canRestartNow(now + RESTART_COOLDOWN_MS), true);
    _setLastRestartAtForTests(0);
  });
});

describe("mapRestartContextToReason", () => {
  it("maps known contexts to restart reasons", () => {
    assert.equal(mapRestartContextToReason("backgroundWatchdog"), "watchdog");
    assert.equal(mapRestartContextToReason("maintainBackgroundTracking"), "appstate");
    assert.equal(mapRestartContextToReason("resumeTrackingIfNeeded"), "os_kill");
    assert.equal(mapRestartContextToReason("foregroundRecover"), "os_kill");
  });
});

describe("canStartLocationForegroundService (foreground recover gate)", () => {
  it("allows FGS start only when app is active", () => {
    assert.equal(canStartLocationForegroundService("active"), true);
    assert.equal(canStartLocationForegroundService("background"), false);
    assert.equal(canStartLocationForegroundService("inactive"), false);
  });
});

describe("shouldPromptBatteryForRestarts", () => {
  it("prompts after repeated restarts or os/watchdog deaths", () => {
    assert.equal(shouldPromptBatteryForRestarts(3, "appstate"), true);
    assert.equal(shouldPromptBatteryForRestarts(1, "os_kill"), true);
    assert.equal(shouldPromptBatteryForRestarts(1, "watchdog"), true);
    assert.equal(shouldPromptBatteryForRestarts(1, "tier_change"), false);
  });
});
