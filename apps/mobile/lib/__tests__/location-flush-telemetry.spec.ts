const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { buildFlushTelemetryPayload } = require("../location-flush-telemetry");

describe("buildFlushTelemetryPayload", () => {
  it("includes appLastSeenAt and lastGpsCapturedAt", () => {
    const payload = buildFlushTelemetryPayload({
      lastGpsCapturedAt: "2026-08-10T09:00:00.000Z",
      nowIso: "2026-08-10T09:01:00.000Z",
    });
    assert.equal(payload.appLastSeenAt, "2026-08-10T09:01:00.000Z");
    assert.equal(payload.lastGpsCapturedAt, "2026-08-10T09:00:00.000Z");
  });

  it("omits lastGpsCapturedAt when null", () => {
    const payload = buildFlushTelemetryPayload({
      lastGpsCapturedAt: null,
      nowIso: "2026-08-10T09:01:00.000Z",
    });
    assert.equal(payload.appLastSeenAt, "2026-08-10T09:01:00.000Z");
    assert.equal(payload.lastGpsCapturedAt, undefined);
  });

  it("maps healthKind to trackingHealthState when provided", () => {
    const payload = buildFlushTelemetryPayload({
      lastGpsCapturedAt: null,
      nowIso: "2026-08-10T09:01:00.000Z",
      healthKind: "zombie_fgs",
    });
    assert.equal(payload.trackingHealthState, "SERVICE_DEAD");
  });
});
