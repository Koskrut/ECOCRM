const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  resolveNativeRuntimeAcceptHealth,
  shouldSuppressNativeAcceptStaleAlert,
  shouldSuppressNativeFlushRetryAlert,
  isJsLocationPipelineDisabled,
} = require("../native-tracking-gates");

describe("native-tracking-gates", () => {
  const now = Date.parse("2026-08-10T18:00:00.000Z");
  const staleJsAccept = new Date(now - 53 * 60_000).toISOString();
  const freshNativeAccept = new Date(now - 60_000).toISOString();
  const freshGps = new Date(now - 30_000).toISOString();

  it("disables JS pipeline only in native_android mode", () => {
    assert.equal(isJsLocationPipelineDisabled("legacy_expo"), false);
    assert.equal(isJsLocationPipelineDisabled("native_android"), true);
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
});
