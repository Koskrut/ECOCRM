import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FieldTrackingHealthState } from "@prisma/client";

import {
  GPS_NONE_THRESHOLD_MS,
  PRESENCE_ONLINE_THRESHOLD_MS,
} from "../../presence/presence.constants";
import {
  deriveTrackingHealthState,
  parseSampleSource,
  parseTrackingHealthState,
} from "../field-tracking-telemetry";

describe("deriveTrackingHealthState", () => {
  const now = Date.parse("2026-08-10T12:00:00.000Z");

  it("returns TRACKING_HEALTHY for fresh B3 accept", () => {
    const state = deriveTrackingHealthState(
      {
        appLastSeenAt: new Date(now - 60_000).toISOString(),
        nativeLastSeenAt: new Date(now - 60_000).toISOString(),
        lastGpsCapturedAt: new Date(now - 60_000).toISOString(),
        lastServerAcceptAt: new Date(now - 60_000).toISOString(),
        trackingHealthState: null,
        lastSampleAt: new Date(now - 60_000).toISOString(),
        trackingEnabled: true,
      },
      now,
    );
    assert.equal(state, "TRACKING_HEALTHY");
  });

  it("does not treat stale app heartbeat as healthy GPS", () => {
    const state = deriveTrackingHealthState(
      {
        appLastSeenAt: new Date(now - 30_000).toISOString(),
        nativeLastSeenAt: null,
        lastGpsCapturedAt: null,
        lastServerAcceptAt: null,
        trackingHealthState: null,
        lastSampleAt: new Date(now - GPS_NONE_THRESHOLD_MS - 1).toISOString(),
        trackingEnabled: true,
      },
      now,
    );
    assert.equal(state, "LOCATION_STALE");
  });

  it("returns SERVICE_DEAD when native heartbeat is gone", () => {
    const state = deriveTrackingHealthState(
      {
        appLastSeenAt: new Date(now - 30_000).toISOString(),
        nativeLastSeenAt: new Date(now - PRESENCE_ONLINE_THRESHOLD_MS * 3).toISOString(),
        lastGpsCapturedAt: new Date(now - 60_000).toISOString(),
        lastServerAcceptAt: new Date(now - 60_000).toISOString(),
        trackingHealthState: null,
        lastSampleAt: new Date(now - 60_000).toISOString(),
        trackingEnabled: true,
      },
      now,
    );
    assert.equal(state, "SERVICE_DEAD");
  });

  it("honours client RECOVERY_IN_PROGRESS", () => {
    const state = deriveTrackingHealthState(
      {
        appLastSeenAt: new Date(now).toISOString(),
        nativeLastSeenAt: new Date(now).toISOString(),
        lastGpsCapturedAt: new Date(now).toISOString(),
        lastServerAcceptAt: new Date(now).toISOString(),
        trackingHealthState: "RECOVERY_IN_PROGRESS" as FieldTrackingHealthState,
        lastSampleAt: new Date(now).toISOString(),
        trackingEnabled: true,
      },
      now,
    );
    assert.equal(state, "RECOVERY_IN_PROGRESS");
  });
});

describe("parseSampleSource", () => {
  it("accepts native_android alias", () => {
    assert.equal(parseSampleSource("native_android"), "NATIVE_ANDROID");
  });
});

describe("parseTrackingHealthState", () => {
  it("parses uppercase input", () => {
    assert.equal(parseTrackingHealthState("TRACKING_HEALTHY"), "TRACKING_HEALTHY");
  });
});
