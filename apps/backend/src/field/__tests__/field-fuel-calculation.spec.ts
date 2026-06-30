import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DateTime } from "luxon";

import { kyivDayBounds } from "../../crm-timezone";
import { haversineDistanceM } from "../../visits/visit-gps.verification";
import { assessGpsTrackQuality } from "../../visits/route-routing.util";

const CRM_TIME_ZONE = "Europe/Kyiv";

function pickCompensationFactKind(factGps: {
  source: string;
  quality: { degraded: boolean };
  path: unknown[];
}): "fact_gps" | "fact_visits" {
  return factGps.source !== "none" && !factGps.quality.degraded && factGps.path.length >= 2
    ? "fact_gps"
    : "fact_visits";
}

function pickCompensationFactKindFromTrack(
  sampleCount: number,
  coverageRatio: number | null,
  source: string,
  pathLength: number,
): "fact_gps" | "fact_visits" {
  const { degraded } = assessGpsTrackQuality(sampleCount, coverageRatio);
  return pickCompensationFactKind({ source, quality: { degraded }, path: new Array(pathLength) });
}

function estimateFuelLiters(compensationKm: number, fuelLitersPer100km: number): number {
  return Math.round(((compensationKm * fuelLitersPer100km) / 100) * 1000) / 1000;
}

function pathDistanceKm(points: { lat: number; lng: number }[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    total += haversineDistanceM(a.lat, a.lng, b.lat, b.lng);
  }
  return Math.round((total / 1000) * 10) / 10;
}

function downsamplePath(path: { lat: number; lng: number }[], maxPoints = 400): typeof path {
  if (path.length <= maxPoints) return path;
  const step = Math.ceil(path.length / maxPoints);
  const out: typeof path = [];
  for (let i = 0; i < path.length; i += step) {
    out.push(path[i]!);
  }
  const last = path[path.length - 1]!;
  const tail = out[out.length - 1];
  if (!tail || tail.lat !== last.lat || tail.lng !== last.lng) {
    out.push(last);
  }
  return out;
}

describe("fuel compensationFactKind selection", () => {
  it("prefers fact_gps when track is healthy", () => {
    const kind = pickCompensationFactKind({
      source: "google",
      quality: { degraded: false },
      path: [{}, {}],
    });
    assert.equal(kind, "fact_gps");
  });

  it("falls back to fact_visits when GPS is degraded", () => {
    const kind = pickCompensationFactKind({
      source: "raw_gps",
      quality: { degraded: true },
      path: [{}, {}, {}],
    });
    assert.equal(kind, "fact_visits");
  });

  it("falls back when insufficient GPS points", () => {
    const kind = pickCompensationFactKind({
      source: "raw_gps",
      quality: { degraded: false },
      path: [{}],
    });
    assert.equal(kind, "fact_visits");
  });

  it("uses fact_gps with many samples despite low coverage ratio", () => {
    const kind = pickCompensationFactKindFromTrack(386, 0.12, "google", 386);
    assert.equal(kind, "fact_gps");
    const quality = assessGpsTrackQuality(386, 0.12);
    assert.equal(quality.degraded, false);
    assert.equal(quality.degradedReason, "gps_partial_coverage");
  });

  it("falls back to fact_visits when low coverage and fewer than 50 samples", () => {
    const kind = pickCompensationFactKindFromTrack(30, 0.12, "raw_gps", 30);
    assert.equal(kind, "fact_visits");
    assert.equal(assessGpsTrackQuality(30, 0.12).degraded, true);
  });
});

describe("fuel estimateFuel liters", () => {
  it("computes liters from km and profile", () => {
    assert.equal(estimateFuelLiters(100, 8.5), 8.5);
    assert.equal(estimateFuelLiters(47.3, 7), 3.311);
  });
});

describe("fuel GPS distance vs downsample", () => {
  it("full filtered path distance is not less than downsampled path distance", () => {
    const fullPath: { lat: number; lng: number }[] = [];
    for (let i = 0; i < 500; i += 1) {
      const angle = (i / 500) * Math.PI * 4;
      fullPath.push({
        lat: 50.45 + Math.sin(angle) * 0.02,
        lng: 30.52 + (i / 500) * 0.08,
      });
    }
    const downsampled = downsamplePath(fullPath, 400);
    const fullKm = pathDistanceKm(fullPath);
    const sampledKm = pathDistanceKm(downsampled);
    assert.ok(fullKm >= sampledKm);
    assert.ok(fullKm > 0);
  });
});

describe("fuel visit day Kyiv bounds", () => {
  it("early-morning Kyiv visit belongs to Kyiv calendar day, not UTC midnight window", () => {
    const dateStr = "2026-06-26";
    const utcStart = new Date(`${dateStr}T00:00:00.000Z`);
    const utcEnd = new Date(utcStart);
    utcEnd.setUTCDate(utcEnd.getUTCDate() + 1);

    const earlyKyiv = DateTime.fromObject(
      { year: 2026, month: 6, day: 26, hour: 1, minute: 30 },
      { zone: CRM_TIME_ZONE },
    ).toJSDate();
    const { from, to } = kyivDayBounds(dateStr);

    const inUtcWindow =
      earlyKyiv.getTime() >= utcStart.getTime() && earlyKyiv.getTime() < utcEnd.getTime();
    const inKyivWindow =
      earlyKyiv.getTime() >= from.getTime() && earlyKyiv.getTime() <= to.getTime();

    assert.equal(inUtcWindow, false);
    assert.equal(inKyivWindow, true);
  });
});
