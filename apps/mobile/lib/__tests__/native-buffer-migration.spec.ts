const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  shouldClearStaleJsLastAcceptedAt,
} = require("../native-buffer-migration-logic");
const {
  displayPendingSamples,
  isNativeTrackingPipelineHealthy,
  shouldSuppressNativeAcceptStaleAlert,
} = require("../native-tracking-gates-core");

describe("shouldClearStaleJsLastAcceptedAt", () => {
  const now = Date.parse("2026-08-11T04:00:00.000Z");
  const staleJs = new Date(now - 53 * 60_000).toISOString();
  const freshNative = new Date(now - 60_000).toISOString();

  it("clears when JS accept is stale", () => {
    assert.equal(shouldClearStaleJsLastAcceptedAt(staleJs, null, now), true);
  });

  it("clears when native accept is fresher", () => {
    assert.equal(shouldClearStaleJsLastAcceptedAt(staleJs, freshNative, now), true);
  });

  it("keeps fresh JS accept without native reference", () => {
    const freshJs = new Date(now - 60_000).toISOString();
    assert.equal(shouldClearStaleJsLastAcceptedAt(freshJs, null, now), false);
  });
});

describe("native UI gates", () => {
  it("shows native Room pending count in native_android", () => {
    assert.equal(displayPendingSamples("native_android", 473, 12), 12);
    assert.equal(displayPendingSamples("native_android", 473), 0);
    assert.equal(displayPendingSamples("legacy_expo", 473), 473);
  });

  it("suppresses stale alert from native FGS health even when computed healthy is false", () => {
    assert.equal(
      shouldSuppressNativeAcceptStaleAlert({
        fieldTrackingMode: "native_android",
        healthy: false,
        backgroundTaskStarted: true,
        acceptStale: true,
        nativeTrackingHealthState: "TRACKING_HEALTHY",
        nativeServiceRunning: true,
      }),
      true,
    );
  });

  it("detects native pipeline healthy", () => {
    assert.equal(
      isNativeTrackingPipelineHealthy({
        trackingHealthState: "NETWORK_DEGRADED",
        serviceRunning: true,
      }),
      true,
    );
    assert.equal(
      isNativeTrackingPipelineHealthy({
        trackingHealthState: "LOCATION_STALE",
        serviceRunning: true,
      }),
      false,
    );
  });
});
