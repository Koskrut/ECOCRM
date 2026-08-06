import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GpsTrackFilterSession,
  MAX_IMPLAUSIBLE_SPEED_KMH,
  MIN_DISTANCE_DEDUP_M,
  REANCHOR_MIN_CLUSTER,
  TRACK_MAX_ACCURACY_M,
  classifyUaFieldCoords,
  coerceLatLng,
  filterGpsSample,
  filterGpsTrack,
  isInUaFieldRegion,
  lastInRegionSample,
  sanitizeGpsTrack,
  sortGpsSamplesByTime,
} from "../gps-sample-filter";

function sample(
  lat: number,
  lng: number,
  seconds: number,
  accuracyM?: number,
): { lat: number; lng: number; accuracyM?: number; clientRecordedAt: string } {
  const base = new Date("2026-06-25T08:00:00.000Z");
  return {
    lat,
    lng,
    accuracyM,
    clientRecordedAt: new Date(base.getTime() + seconds * 1000).toISOString(),
  };
}

describe("filterGpsSample", () => {
  it("rejects poor accuracy above 150m", () => {
    const next = sample(50.45, 30.52, 0, TRACK_MAX_ACCURACY_M + 1);
    const result = filterGpsSample(null, next);
    assert.equal(result.accept, false);
    assert.equal(result.reason, "bad_accuracy");
  });

  it("accepts accuracy at exactly 150m", () => {
    const next = sample(50.45, 30.52, 0, TRACK_MAX_ACCURACY_M);
    const result = filterGpsSample(null, next);
    assert.equal(result.accept, true);
  });

  it("accepts first sample with good accuracy", () => {
    const next = sample(50.45, 30.52, 0, 20);
    const result = filterGpsSample(null, next);
    assert.equal(result.accept, true);
  });

  it("rejects first sample outside UA field region (Lima mock)", () => {
    const next = sample(-12.04, -77.05, 0, 20);
    const result = filterGpsSample(null, next);
    assert.equal(result.accept, false);
    assert.equal(result.reason, "out_of_region");
    assert.equal(isInUaFieldRegion(-12.04, -77.05), false);
  });

  it("rejects NaN as invalid_coords not out_of_region", () => {
    const next = sample(Number.NaN, 35.01, 0, 20);
    const result = filterGpsSample(null, next);
    assert.equal(result.accept, false);
    assert.equal(result.reason, "invalid_coords");
  });

  it("accepts string-coerced Dnipro coords via classify", () => {
    const c = coerceLatLng("48.39", "35.01");
    assert.ok(c);
    assert.equal(classifyUaFieldCoords("48.39", "35.01").ok, true);
  });

  it("accepts keepalive duplicate after KEEPALIVE_INTERVAL_MS", () => {
    const prev = sample(50.45, 30.52, 0, 20);
    const next = sample(50.45005, 30.52005, 60 * 3 + 1, 20);
    const result = filterGpsSample(prev, next);
    assert.equal(result.accept, true);
  });

  it("rejects duplicate within MIN_DISTANCE_DEDUP_M", () => {
    const prev = sample(50.45, 30.52, 0, 20);
    const next = sample(50.45005, 30.52005, 60, 20);
    const result = filterGpsSample(prev, next);
    assert.equal(result.accept, false);
    assert.equal(result.reason, "duplicate");
  });

  it("accepts sample beyond MIN_DISTANCE_DEDUP_M", () => {
    const prev = sample(50.45, 30.52, 0, 20);
    const next = sample(50.4502, 30.5202, 30, 20);
    const result = filterGpsSample(prev, next);
    assert.equal(result.accept, true);
  });

  it("rejects teleport jumps above 150 km/h", () => {
    const prev = sample(50.45, 30.52, 0, 20);
    const next = sample(51.0, 31.0, 10, 20);
    const result = filterGpsSample(prev, next);
    assert.equal(result.accept, false);
    assert.equal(result.reason, "teleport");
  });

  it("rejects same-timestamp jump beyond dedup distance", () => {
    const prev = sample(50.45, 30.52, 0, 20);
    const next = sample(50.46, 30.53, 0, 20);
    const result = filterGpsSample(prev, next);
    assert.equal(result.accept, false);
    assert.equal(result.reason, "teleport");
  });

  it("rejects older-timestamp jump beyond dedup distance (out-of-order)", () => {
    const prev = sample(50.45, 30.52, 60, 20);
    const next = sample(50.46, 30.53, 0, 20);
    const result = filterGpsSample(prev, next);
    assert.equal(result.accept, false);
    assert.equal(result.reason, "teleport");
  });

  it("accepts plausible movement", () => {
    const prev = sample(50.45, 30.52, 0, 20);
    const next = sample(50.4505, 30.5205, 30, 20);
    const result = filterGpsSample(prev, next);
    assert.equal(result.accept, true);
  });

  it("rejects speed just above MAX_IMPLAUSIBLE_SPEED_KMH", () => {
    const prev = sample(50.45, 30.52, 0, 20);
    const distDeg = (MAX_IMPLAUSIBLE_SPEED_KMH / 3600) * 10 / 111;
    const next = sample(50.45 + distDeg, 30.52, 10, 20);
    const result = filterGpsSample(prev, next);
    assert.equal(result.accept, false);
    assert.equal(result.reason, "teleport");
  });
});

describe("Gumenyuk Lima→Odessa", () => {
  it("geo drops Lima; Odessa becomes clean UA track", () => {
    const lima = [
      sample(-12.0464, -77.0428, 0, 20),
      sample(-12.047, -77.043, 60, 20),
      sample(-12.048, -77.044, 120, 20),
    ];
    const odessa = [
      sample(46.4825, 30.7233, 600, 20),
      sample(46.483, 30.724, 660, 20),
      sample(46.4835, 30.7245, 720, 25),
    ];
    const sanitized = sanitizeGpsTrack([...lima, ...odessa]);
    assert.ok((sanitized.droppedReasons.out_of_region ?? 0) >= lima.length);
    assert.equal(sanitized.samples.length, odessa.length);
    assert.ok(sanitized.samples.every((s) => isInUaFieldRegion(s.lat, s.lng)));
    assert.equal(sanitized.samples[0]!.lat, 46.4825);
  });

  it("reanchors when prev is dirty UA-adjacent then cluster settles in Odessa", () => {
    // Simulate DB prev already stored (historical) at Lima — session ignores out-of-region prev.
    const session = new GpsTrackFilterSession(sample(-12.04, -77.05, 0, 20));
    assert.equal(session.prevSample, null);

    const odessa = [
      sample(46.4825, 30.7233, 60, 20),
      sample(46.483, 30.724, 120, 20),
      sample(46.4835, 30.7245, 180, 20),
    ];
    const accepted = odessa.map((s) => session.consider(s));
    assert.ok(accepted.every((r) => r.accept));
  });

  it("reanchors after teleport from Kyiv cluster to Odessa cluster", () => {
    const session = new GpsTrackFilterSession(null);
    assert.equal(session.consider(sample(50.45, 30.52, 0, 20)).accept, true);

    // Instant jump to Odessa → teleport until cluster agrees
    const jump = [
      sample(46.4825, 30.7233, 10, 20),
      sample(46.4826, 30.7234, 20, 20),
      sample(46.4827, 30.7235, 30, 20),
    ];
    assert.equal(REANCHOR_MIN_CLUSTER, 3);
    const r0 = session.consider(jump[0]!);
    const r1 = session.consider(jump[1]!);
    const r2 = session.consider(jump[2]!);
    assert.equal(r0.accept, false);
    assert.equal(r0.reason, "teleport");
    assert.equal(r1.accept, false);
    assert.equal(r2.accept, true);
    assert.equal(r2.reanchor, true);
    assert.equal(session.reanchorUsed, true);

    const next = session.consider(sample(46.483, 30.724, 90, 20));
    assert.equal(next.accept, true);
  });

  it("sanitize after reanchor drops pre-jump segment (no 400km path)", () => {
    const chain = [
      sample(50.45, 30.52, 0, 20),
      sample(50.4503, 30.5203, 60, 20),
      sample(46.4825, 30.7233, 70, 20),
      sample(46.4826, 30.7234, 80, 20),
      sample(46.4827, 30.7235, 90, 20),
      sample(46.483, 30.724, 150, 20),
    ];
    const sanitized = sanitizeGpsTrack(chain);
    assert.equal(sanitized.reanchorUsed, true);
    assert.ok((sanitized.droppedReasons.reanchor_trim ?? 0) >= 1);
    assert.ok(sanitized.samples.every((s) => s.lat < 47));
    assert.ok(sanitized.samples.every((s) => s.lat > 46));
    // Path must stay Odessa-local, not Kyiv→Odessa cosmic km.
    let km = 0;
    for (let i = 0; i < sanitized.samples.length - 1; i++) {
      const a = sanitized.samples[i]!;
      const b = sanitized.samples[i + 1]!;
      const R = 6371;
      const toRad = (d: number) => (d * Math.PI) / 180;
      const dLat = toRad(b.lat - a.lat);
      const dLon = toRad(b.lng - a.lng);
      const x =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
      km += 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    }
    assert.ok(km < 5, `expected local km, got ${km}`);
  });
});

describe("filterGpsTrack / sanitizeGpsTrack", () => {
  it("filters a chain of five points keeping valid segments", () => {
    const chain = [
      sample(50.45, 30.52, 0, 20),
      sample(50.45005, 30.52005, 30, 20),
      sample(50.4503, 30.5203, 60, 20),
      sample(50.4506, 30.5206, 90, TRACK_MAX_ACCURACY_M + 50),
      sample(50.451, 30.521, 120, 25),
    ];
    const filtered = filterGpsTrack(chain);
    assert.equal(filtered.length, 3);
    assert.equal(filtered[0]!.lat, 50.45);
    assert.equal(filtered[1]!.lat, 50.4503);
    assert.equal(filtered[2]!.lat, 50.451);
  });

  it("keeps chain when points are spaced beyond dedup threshold", () => {
    const chain = [
      sample(50.45, 30.52, 0, 20),
      sample(50.4503, 30.5203, 60, 20),
      sample(50.451, 30.521, 120, 25),
    ];
    const filtered = filterGpsTrack(chain);
    assert.equal(filtered.length, 3);
    assert.ok(filtered.length >= MIN_DISTANCE_DEDUP_M || filtered.length === 3);
  });

  it("lastInRegionSample skips abroad points", () => {
    const rows = [
      sample(-12.04, -77.05, 0, 20),
      sample(46.48, 30.72, 60, 20),
      sample(-12.05, -77.06, 120, 20),
    ];
    const last = lastInRegionSample(rows);
    assert.ok(last);
    assert.equal(last!.lat, 46.48);
  });
});

describe("sortGpsSamplesByTime", () => {
  it("sorts reverse batch to same filter result as ascending", () => {
    const ascending = [
      sample(50.45, 30.52, 0, 20),
      sample(50.4503, 30.5203, 60, 20),
      sample(50.451, 30.521, 120, 25),
    ];
    const reversed = [...ascending].reverse();
    const fromSorted = filterGpsTrack(sortGpsSamplesByTime(reversed));
    const fromAscending = filterGpsTrack(ascending);
    assert.deepEqual(
      fromSorted.map((s) => s.clientRecordedAt),
      fromAscending.map((s) => s.clientRecordedAt),
    );
  });
});
