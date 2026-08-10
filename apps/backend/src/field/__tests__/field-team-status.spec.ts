import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GPS_NONE_THRESHOLD_MS,
  GPS_STALE_THRESHOLD_MS,
  PRESENCE_ONLINE_THRESHOLD_MS,
} from "../../presence/presence.constants";
import { deriveDevicePresence, deriveGpsStatus, deriveTrackingTelemetry } from "../field-team-status";
import { FieldTrackingHealthState } from "@prisma/client";

describe("deriveGpsStatus", () => {
  const now = Date.parse("2026-06-29T12:00:00.000Z");

  it("returns disabled when tracking is off", () => {
    assert.equal(deriveGpsStatus(false, now, now), "disabled");
  });

  it("returns none without samples", () => {
    assert.equal(deriveGpsStatus(true, null, now), "none");
  });

  it("returns ok for fresh sample", () => {
    const recent = new Date(now - 2 * 60_000).toISOString();
    assert.equal(deriveGpsStatus(true, recent, now), "ok");
  });

  it("returns stale for old sample", () => {
    const old = new Date(now - GPS_STALE_THRESHOLD_MS - 1).toISOString();
    assert.equal(deriveGpsStatus(true, old, now), "stale");
  });

  it("returns none when sample is older than 30 min", () => {
    const dead = new Date(now - GPS_NONE_THRESHOLD_MS - 1).toISOString();
    assert.equal(deriveGpsStatus(true, dead, now), "none");
  });
});

describe("deriveDevicePresence", () => {
  const now = Date.parse("2026-06-29T12:00:00.000Z");

  it("returns null without session", () => {
    assert.equal(deriveDevicePresence(null, now), null);
  });

  it("returns app state when heartbeat is fresh", () => {
    const session = {
      lastSeenAt: new Date(now - 30_000),
      appState: "BACKGROUND",
      trackingMode: "background",
    };
    const result = deriveDevicePresence(session, now);
    assert.deepEqual(result, {
      appState: "BACKGROUND",
      trackingMode: "background",
      lastSeenAt: session.lastSeenAt.toISOString(),
    });
  });

  it("clears app state when heartbeat is stale", () => {
    const session = {
      lastSeenAt: new Date(now - PRESENCE_ONLINE_THRESHOLD_MS - 1),
      appState: "ACTIVE",
      trackingMode: "foreground",
    };
    const result = deriveDevicePresence(session, now);
    assert.equal(result?.appState, null);
    assert.equal(result?.trackingMode, "foreground");
  });
});

describe("deriveTrackingTelemetry", () => {
  const now = Date.parse("2026-08-10T12:00:00.000Z");

  it("formats session timestamps and derived health", () => {
    const session = {
      lastSeenAt: new Date(now - 60_000),
      appLastSeenAt: new Date(now - 60_000),
      nativeLastSeenAt: null,
      lastGpsCapturedAt: new Date(now - 60_000),
      lastServerAcceptAt: new Date(now - 60_000),
      trackingHealthState: null as FieldTrackingHealthState | null,
    };
    const result = deriveTrackingTelemetry(session, {
      trackingEnabled: true,
      lastSampleAt: new Date(now - 60_000),
      nowMs: now,
    });
    assert.ok(result);
    assert.equal(result?.derivedHealthState, "TRACKING_HEALTHY");
    assert.equal(result?.appLastSeenAt, session.appLastSeenAt.toISOString());
  });
});
