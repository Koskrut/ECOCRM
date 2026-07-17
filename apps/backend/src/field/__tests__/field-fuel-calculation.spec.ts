import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MIN_TRACK_COMPENSATION_KM,
  MIN_TRACK_COMPENSATION_SAMPLES,
  isTrackEligibleForCompensation,
} from "../../visits/route-routing.util";
import { haversineDistanceM } from "../../visits/visit-gps.verification";

function pickCompensationFactKind(factGps: {
  quality: {
    hasTrackingEnabledShift?: boolean;
    sampleCount: number;
    rawDistanceKm?: number | null;
    coverageRatio?: number | null;
    lastSampleAt?: string | null;
    lastDoneVisitCompletedAt?: string | null;
  };
}): "fact_gps" | "fact_visits" {
  const eligibility = isTrackEligibleForCompensation({
    hasTrackingEnabledShift: factGps.quality.hasTrackingEnabledShift ?? false,
    filteredSampleCount: factGps.quality.sampleCount,
    rawPolylineDistanceKm: factGps.quality.rawDistanceKm ?? null,
    coverageRatio: factGps.quality.coverageRatio,
    lastSampleAt: factGps.quality.lastSampleAt,
    lastDoneVisitCompletedAt: factGps.quality.lastDoneVisitCompletedAt,
  });
  return eligibility.eligible ? "fact_gps" : "fact_visits";
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

describe("fuel compensationFactKind selection (v2 eligibility)", () => {
  it("prefers fact_gps when track meets v2 thresholds", () => {
    const rawKm = 1.2;
    const kind = pickCompensationFactKind({
      quality: {
        hasTrackingEnabledShift: true,
        sampleCount: 5,
        rawDistanceKm: rawKm,
        coverageRatio: 0.85,
      },
    });
    assert.equal(kind, "fact_gps");
    assert.ok(rawKm >= MIN_TRACK_COMPENSATION_KM);
    assert.ok(5 >= MIN_TRACK_COMPENSATION_SAMPLES);
  });

  it("falls back to fact_visits when track shorter than 0.5 km", () => {
    const kind = pickCompensationFactKind({
      quality: {
        hasTrackingEnabledShift: true,
        sampleCount: 20,
        rawDistanceKm: 0.4,
      },
    });
    assert.equal(kind, "fact_visits");
  });

  it("falls back when only one filtered sample", () => {
    const kind = pickCompensationFactKind({
      quality: {
        hasTrackingEnabledShift: true,
        sampleCount: 1,
        rawDistanceKm: 10,
      },
    });
    assert.equal(kind, "fact_visits");
  });

  it("falls back when no tracking-enabled shift", () => {
    const kind = pickCompensationFactKind({
      quality: {
        hasTrackingEnabledShift: false,
        sampleCount: 100,
        rawDistanceKm: 50,
      },
    });
    assert.equal(kind, "fact_visits");
  });

  it("eligible at exactly 0.5 km with 2 samples", () => {
    const points = [
      { lat: 50.45, lng: 30.52 },
      { lat: 50.4545, lng: 30.52 },
    ];
    const rawKm = pathDistanceKm(points);
    assert.ok(rawKm >= MIN_TRACK_COMPENSATION_KM);
    const kind = pickCompensationFactKind({
      quality: {
        hasTrackingEnabledShift: true,
        sampleCount: 2,
        rawDistanceKm: rawKm,
      },
    });
    assert.equal(kind, "fact_gps");
  });
});

describe("fuel estimateFuel liters", () => {
  function estimateFuelLiters(compensationKm: number, fuelLitersPer100km: number): number {
    return Math.round(((compensationKm * fuelLitersPer100km) / 100) * 1000) / 1000;
  }

  it("computes liters from km and profile", () => {
    assert.equal(estimateFuelLiters(100, 8.5), 8.5);
    assert.equal(estimateFuelLiters(47.3, 7), 3.311);
  });
});
