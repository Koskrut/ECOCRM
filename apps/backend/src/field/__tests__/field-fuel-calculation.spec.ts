import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MIN_TRACK_COMPENSATION_KM,
  MIN_TRACK_COMPENSATION_SAMPLES,
  assessPlannedKm,
  selectCompensationFactKind,
} from "../../visits/route-routing.util";
import { haversineDistanceM } from "../../visits/visit-gps.verification";
import { sanitizeGpsTrack } from "../gps-sample-filter";
import { estimateFuelFromKm } from "../field-fuel.estimate";

function pickCompensationFactKind(
  factGps: {
    quality: {
      hasTrackingEnabledShift?: boolean;
      sampleCount: number;
      rawDistanceKm?: number | null;
      coverageRatio?: number | null;
      lastSampleAt?: string | null;
      lastDoneVisitCompletedAt?: string | null;
    };
  },
  visitRouteDistanceKm: number | null = null,
  snappedTrackDistanceKm?: number | null,
): "fact_gps" | "fact_visits" | "none" {
  return selectCompensationFactKind({
    hasTrackingEnabledShift: factGps.quality.hasTrackingEnabledShift ?? false,
    filteredSampleCount: factGps.quality.sampleCount,
    rawPolylineDistanceKm: factGps.quality.rawDistanceKm ?? null,
    coverageRatio: factGps.quality.coverageRatio,
    lastSampleAt: factGps.quality.lastSampleAt,
    lastDoneVisitCompletedAt: factGps.quality.lastDoneVisitCompletedAt,
    snappedTrackDistanceKm: snappedTrackDistanceKm ?? factGps.quality.rawDistanceKm ?? null,
    visitRouteDistanceKm,
  }).kind;
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

  it("falls back to fact_visits when track shorter than 0.5 km and visits exist", () => {
    const kind = pickCompensationFactKind(
      {
        quality: {
          hasTrackingEnabledShift: true,
          sampleCount: 20,
          rawDistanceKm: 0.4,
        },
      },
      12,
    );
    assert.equal(kind, "fact_visits");
  });

  it("no visits + short track → none", () => {
    const kind = pickCompensationFactKind({
      quality: {
        hasTrackingEnabledShift: true,
        sampleCount: 20,
        rawDistanceKm: 0.4,
      },
    });
    assert.equal(kind, "none");
  });

  it("falls back when only one filtered sample", () => {
    const kind = pickCompensationFactKind(
      {
        quality: {
          hasTrackingEnabledShift: true,
          sampleCount: 1,
          rawDistanceKm: 10,
        },
      },
      12,
    );
    assert.equal(kind, "fact_visits");
  });

  it("falls back when no tracking-enabled shift", () => {
    const kind = pickCompensationFactKind(
      {
        quality: {
          hasTrackingEnabledShift: false,
          sampleCount: 100,
          rawDistanceKm: 50,
        },
      },
      12,
    );
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

describe("fuel dirty Lima track → fact_visits (not cosmic km)", () => {
  it("sanitize drops Lima; remaining UA track short → fact_visits", () => {
    const base = Date.parse("2026-07-31T08:00:00.000Z");
    const dirty = [
      ...Array.from({ length: 11 }, (_, i) => ({
        lat: -12.04 - i * 0.0001,
        lng: -77.05 - i * 0.0001,
        accuracyM: 20,
        clientRecordedAt: new Date(base + i * 60_000).toISOString(),
      })),
      {
        lat: 46.4825,
        lng: 30.7233,
        accuracyM: 20,
        clientRecordedAt: new Date(base + 12 * 60_000).toISOString(),
      },
    ];
    const sanitized = sanitizeGpsTrack(dirty);
    assert.ok((sanitized.droppedReasons.out_of_region ?? 0) >= 11);
    assert.equal(sanitized.filteredSampleCount, 1);
    const rawKm = pathDistanceKm(sanitized.samples);
    // Single point → 0 km; not eligible for fact_gps
    assert.ok(rawKm < MIN_TRACK_COMPENSATION_KM);
    const kind = pickCompensationFactKind(
      {
        quality: {
          hasTrackingEnabledShift: true,
          sampleCount: sanitized.filteredSampleCount,
          rawDistanceKm: rawKm || null,
          coverageRatio: 0.1,
        },
      },
      25,
    );
    assert.equal(kind, "fact_visits");
  });

  it("clean UA track with enough samples → fact_gps", () => {
    const base = Date.parse("2026-07-31T08:00:00.000Z");
    const clean = Array.from({ length: 20 }, (_, i) => ({
      lat: 46.48 + i * 0.001,
      lng: 30.72 + i * 0.001,
      accuracyM: 20,
      clientRecordedAt: new Date(base + i * 120_000).toISOString(),
    }));
    const sanitized = sanitizeGpsTrack(clean);
    assert.equal(sanitized.reanchorUsed, false);
    assert.ok(sanitized.filteredSampleCount >= MIN_TRACK_COMPENSATION_SAMPLES);
    const rawKm = pathDistanceKm(sanitized.samples);
    assert.ok(rawKm >= MIN_TRACK_COMPENSATION_KM);
    const kind = pickCompensationFactKind({
      quality: {
        hasTrackingEnabledShift: true,
        sampleCount: sanitized.filteredSampleCount,
        rawDistanceKm: rawKm,
        coverageRatio: 0.9,
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

describe("Hrybovska-like soft GPS payout", () => {
  it("low coverage + usable track + no visits → fact_gps with warning", () => {
    const selection = selectCompensationFactKind({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 14,
      rawPolylineDistanceKm: 18.8,
      coverageRatio: 0.54,
      snappedTrackDistanceKm: 18.8,
      visitRouteDistanceKm: null,
    });
    assert.equal(selection.kind, "fact_gps");
    assert.equal(selection.ineligibleReason, null);
    assert.ok(selection.warnings.includes("gps_low_coverage"));
    assert.ok(selection.warnings.includes("gps_partial_coverage"));
  });

  it("low coverage + usable visits → still prefer fact_visits (Gumenyuk)", () => {
    const selection = selectCompensationFactKind({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 180,
      rawPolylineDistanceKm: 18,
      coverageRatio: 0.52,
      snappedTrackDistanceKm: 18,
      visitRouteDistanceKm: 35.1,
    });
    assert.equal(selection.kind, "fact_visits");
    assert.equal(selection.ineligibleReason, "gps_low_coverage");
  });

  it("GPS-only eligible day at thresholds → fact_gps (not null)", () => {
    const selection = selectCompensationFactKind({
      hasTrackingEnabledShift: true,
      filteredSampleCount: MIN_TRACK_COMPENSATION_SAMPLES,
      rawPolylineDistanceKm: MIN_TRACK_COMPENSATION_KM,
      coverageRatio: 0.5,
      snappedTrackDistanceKm: MIN_TRACK_COMPENSATION_KM,
      visitRouteDistanceKm: null,
    });
    assert.equal(selection.kind, "fact_gps");
  });
});

describe("amountEstimated persist when price+liters (metricsSource=none path)", () => {
  it("always computes amount when compensationKm + liters + price exist", () => {
    const r = estimateFuelFromKm(18.8, {
      fuelLitersPer100km: 8,
      fuelPricePerLiter: 78.9,
    });
    assert.equal(r.litersEstimated, 1.504);
    assert.ok(r.amountEstimated != null);
    assert.ok(Math.abs(Number(r.amountEstimated) - 1.504 * 78.9) < 0.001);
  });

  it("keeps liters without amount when price missing (ok for manager)", () => {
    const r = estimateFuelFromKm(18.8, {
      fuelLitersPer100km: 8,
      fuelPricePerLiter: null,
    });
    assert.equal(r.litersEstimated, 1.504);
    assert.equal(r.amountEstimated, null);
  });
});

describe("fuel snapshot fields (GPS contour)", () => {
  it("loop collapse with visit line → fact_visits (not hybrid money)", () => {
    const sel = selectCompensationFactKind({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 100,
      rawPolylineDistanceKm: 165,
      coverageRatio: 0.88,
      snappedTrackDistanceKm: 1.4,
      visitRouteDistanceKm: 261,
      snapFailureReason: "gps_snap_loop_collapse",
    });
    assert.equal(sel.kind, "fact_visits");
    assert.ok(sel.warnings.includes("gps_snap_loop_collapse"));
  });

  it("loop collapse without visits → none", () => {
    const sel = selectCompensationFactKind({
      hasTrackingEnabledShift: true,
      filteredSampleCount: 100,
      rawPolylineDistanceKm: 165,
      coverageRatio: 0.88,
      snappedTrackDistanceKm: 1.4,
      visitRouteDistanceKm: null,
      factVisitsGpsDistanceKm: 170.5,
      snapFailureReason: "gps_snap_loop_collapse",
    });
    assert.equal(sel.kind, "none");
    assert.equal(sel.ineligibleReason, "gps_snap_loop_collapse");
  });
});

describe("plannedKm sanitize", () => {
  it("flags Bondarenko-like 5000+ plan", () => {
    const a = assessPlannedKm({ plannedKm: 5289, factKm: 20 });
    assert.equal(a.degraded, true);
    assert.equal(a.warning, "planned_km_implausibly_large");
  });

  it("flags plan > 3× fact", () => {
    const a = assessPlannedKm({ plannedKm: 120, factKm: 30 });
    assert.equal(a.degraded, true);
    assert.equal(a.warning, "planned_km_vs_fact_outlier");
  });
});
