const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { shouldShowBatteryOptimizationWarning } = require("../battery-optimization-logic");

describe("shouldShowBatteryOptimizationWarning", () => {
  const now = Date.parse("2026-08-06T12:00:00.000Z");

  it("suppresses unknown battery when healthy with fresh accept", () => {
    assert.equal(
      shouldShowBatteryOptimizationWarning({
        batteryStatus: "unknown",
        trackingMode: "background",
        healthy: true,
        backgroundTaskStarted: true,
        lastAcceptedAt: new Date(now - 2 * 60_000).toISOString(),
        nowMs: now,
      }),
      false,
    );
  });

  it("suppresses restricted when healthy with fresh accept", () => {
    assert.equal(
      shouldShowBatteryOptimizationWarning({
        batteryStatus: "restricted",
        trackingMode: "background",
        healthy: true,
        backgroundTaskStarted: true,
        lastAcceptedAt: new Date(now - 60_000).toISOString(),
        nowMs: now,
      }),
      false,
    );
  });

  it("shows restricted when tracking unhealthy", () => {
    assert.equal(
      shouldShowBatteryOptimizationWarning({
        batteryStatus: "restricted",
        trackingMode: "background",
        healthy: false,
        backgroundTaskStarted: true,
        lastAcceptedAt: new Date(now - 60_000).toISOString(),
        nowMs: now,
      }),
      true,
    );
  });

  it("shows unknown when accept is stale on background mode", () => {
    assert.equal(
      shouldShowBatteryOptimizationWarning({
        batteryStatus: "unknown",
        trackingMode: "background",
        healthy: false,
        backgroundTaskStarted: true,
        lastAcceptedAt: new Date(now - 20 * 60_000).toISOString(),
        nowMs: now,
      }),
      true,
    );
  });

  it("never shows when tracking off", () => {
    assert.equal(
      shouldShowBatteryOptimizationWarning({
        batteryStatus: "restricted",
        trackingMode: "none",
        healthy: false,
        backgroundTaskStarted: false,
        lastAcceptedAt: null,
        nowMs: now,
      }),
      false,
    );
  });
});
