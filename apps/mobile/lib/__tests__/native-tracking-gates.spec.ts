const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  resolveNativeRuntimeAcceptHealth,
  shouldSuppressNativeAcceptStaleAlert,
  shouldSuppressNativeFlushRetryAlert,
  deriveNativeHealthKind,
  isNativeAcceptTimestampStale,
} = require("../native-tracking-gates-core");
const {
  shouldUseNativeTracking,
  shouldUseExpoTracking,
} = require("../tracking-feature-flag-core");

describe("native-tracking-gates", () => {
  const now = Date.parse("2026-08-10T18:00:00.000Z");
  const staleJsAccept = new Date(now - 53 * 60_000).toISOString();
  const freshNativeAccept = new Date(now - 60_000).toISOString();
  const freshGps = new Date(now - 30_000).toISOString();

  it("disables JS pipeline only in native_android mode", () => {
    assert.equal(shouldUseExpoTracking("legacy_expo"), true);
    assert.equal(shouldUseNativeTracking("native_android"), true);
  });

  it("trusts native healthy FGS over stale JS lastAcceptedAt", () => {
    const result = resolveNativeRuntimeAcceptHealth(
      {
        trackingHealthState: "TRACKING_HEALTHY",
        serviceRunning: true,
        lastServerAcceptAt: freshNativeAccept,
        lastGpsCapturedAt: freshGps,
      },
      staleJsAccept,
      false,
    );
    assert.equal(result.acceptStale, false);
    assert.equal(result.lastAcceptedAt, freshNativeAccept);
  });

  it("uses native GPS timestamp when healthy but accept missing", () => {
    const result = resolveNativeRuntimeAcceptHealth(
      {
        trackingHealthState: "NETWORK_DEGRADED",
        serviceRunning: true,
        lastServerAcceptAt: null,
        lastGpsCapturedAt: freshGps,
      },
      staleJsAccept,
      false,
    );
    assert.equal(result.acceptStale, false);
    assert.equal(result.lastAcceptedAt, freshGps);
  });

  it("falls back to JS accept when native unhealthy", () => {
    const result = resolveNativeRuntimeAcceptHealth(
      {
        trackingHealthState: "LOCATION_STALE",
        serviceRunning: true,
        lastServerAcceptAt: null,
        lastGpsCapturedAt: freshGps,
      },
      staleJsAccept,
      false,
    );
    assert.equal(result.acceptStale, true);
    assert.equal(result.lastAcceptedAt, staleJsAccept);
  });

  it("suppresses accept_stale alert when native healthy", () => {
    assert.equal(
      shouldSuppressNativeAcceptStaleAlert({
        fieldTrackingMode: "native_android",
        healthy: true,
        backgroundTaskStarted: true,
        acceptStale: true,
        nativeTrackingHealthState: "TRACKING_HEALTHY",
        nativeServiceRunning: true,
      }),
      true,
    );
    assert.equal(
      shouldSuppressNativeAcceptStaleAlert({
        fieldTrackingMode: "legacy_expo",
        healthy: true,
        backgroundTaskStarted: true,
        acceptStale: true,
      }),
      false,
    );
  });

  it("does not treat stale JS accept as stale before native bridge responds", () => {
    const result = resolveNativeRuntimeAcceptHealth(null, staleJsAccept, true, {
      nativeMode: true,
    });
    assert.equal(result.acceptStale, false);
  });

  it("treats missing bridge + cleared JS accept as stale after warmup", () => {
    const result = resolveNativeRuntimeAcceptHealth(null, null, false, {
      nativeMode: true,
    });
    assert.equal(result.acceptStale, true);
  });

  it("treats stale JS accept as stale after warmup when native bridge is null", () => {
    const result = resolveNativeRuntimeAcceptHealth(null, staleJsAccept, false, {
      nativeMode: true,
    });
    assert.equal(result.acceptStale, true);
  });

  it("suppresses flush retry alert in native_android", () => {
    assert.equal(
      shouldSuppressNativeFlushRetryAlert({ fieldTrackingMode: "native_android" }),
      true,
    );
    assert.equal(
      shouldSuppressNativeFlushRetryAlert({ fieldTrackingMode: "legacy_expo" }),
      false,
    );
  });

  it("does not suppress alert when native state is LOCATION_STALE", () => {
    assert.equal(
      shouldSuppressNativeAcceptStaleAlert({
        fieldTrackingMode: "native_android",
        healthy: false,
        backgroundTaskStarted: true,
        acceptStale: true,
        nativeTrackingHealthState: "LOCATION_STALE",
        nativeServiceRunning: true,
      }),
      false,
    );
  });

  it("labels zombie_fgs when FGS runs but accept is stale (not task_dead)", () => {
    assert.equal(
      deriveNativeHealthKind({
        serviceRunning: true,
        acceptStale: true,
        pointStale: false,
        trackingHealthState: "LOCATION_STALE",
      }),
      "zombie_fgs",
    );
  });

  it("does not label zombie_fgs when evaluator reports TRACKING_HEALTHY (soft dedup)", () => {
    assert.equal(
      deriveNativeHealthKind({
        serviceRunning: true,
        acceptStale: true,
        pointStale: false,
        trackingHealthState: "TRACKING_HEALTHY",
      }),
      "healthy",
    );
  });

  it("labels task_dead only when FGS is not running", () => {
    assert.equal(
      deriveNativeHealthKind({
        serviceRunning: false,
        acceptStale: true,
        pointStale: false,
        trackingHealthState: "LOCATION_STALE",
      }),
      "task_dead",
    );
  });
});
