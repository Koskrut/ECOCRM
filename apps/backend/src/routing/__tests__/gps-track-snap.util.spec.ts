import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  dedupeRepeatedPathLegs,
  isPathDistanceInconsistent,
  maxStraightSegmentKm,
  mergeSnapPathsForDisplay,
  reconcileSnapPathDisplay,
  splitSamplesByTimeGap,
  stitchPathGaps,
  STITCH_GAP_THRESHOLD_KM,
  type TrackedGpsSample,
} from "../gps-track-snap.util";

/** Gribovskaya-like: two clusters ~7.4 km apart (12 samples). */
function gribovskayaSamples(): TrackedGpsSample[] {
  const morning: TrackedGpsSample[] = Array.from({ length: 6 }, (_, i) => ({
    lat: 50.42 + i * 0.001,
    lng: 30.48 + i * 0.001,
    clientRecordedAt: new Date(`2026-07-20T06:${String(10 + i).padStart(2, "0")}:00.000Z`),
  }));
  const afternoon: TrackedGpsSample[] = Array.from({ length: 6 }, (_, i) => ({
    lat: 50.48 + i * 0.001,
    lng: 30.55 + i * 0.001,
    clientRecordedAt: new Date(`2026-07-20T08:${String(10 + i).padStart(2, "0")}:00.000Z`),
  }));
  return [...morning, ...afternoon];
}

describe("splitSamplesByTimeGap", () => {
  it("splits Gribovskaya 12 samples on 30+ min gap", () => {
    const chunks = splitSamplesByTimeGap(gribovskayaSamples(), 30);
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0]!.length, 6);
    assert.equal(chunks[1]!.length, 6);
  });
});

describe("stitchPathGaps", () => {
  it("fills 7+ km gap between two matchings via routeLeg", async () => {
    const clusterA = { lat: 50.425, lng: 30.485 };
    const clusterB = { lat: 50.485, lng: 30.555 };
    const rawPath = [clusterA, clusterB];
    assert.ok(maxStraightSegmentKm(rawPath) > 7);

    const stitched = await stitchPathGaps(
      rawPath,
      async (origin, dest) => {
        assert.deepEqual(origin, clusterA);
        assert.deepEqual(dest, clusterB);
        const steps = 20;
        const path = Array.from({ length: steps + 1 }, (_, i) => ({
          lat: origin.lat + ((dest.lat - origin.lat) * i) / steps,
          lng: origin.lng + ((dest.lng - origin.lng) * i) / steps,
        }));
        return { path };
      },
      STITCH_GAP_THRESHOLD_KM,
    );

    assert.ok(stitched.path.length > 2);
    assert.ok(stitched.maxStitchGapKm < 0.5);
    assert.equal(stitched.hasUnfilledGaps, false);
  });

  it("marks hasUnfilledGaps when routeLeg fails and gap > 1 km", async () => {
    const rawPath = [
      { lat: 50.42, lng: 30.48 },
      { lat: 50.49, lng: 30.56 },
    ];
    const stitched = await stitchPathGaps(rawPath, async () => null, STITCH_GAP_THRESHOLD_KM);
    assert.equal(stitched.hasUnfilledGaps, true);
    assert.ok(stitched.maxStitchGapKm > 1);
  });
});

describe("isPathDistanceInconsistent", () => {
  it("flags Bondarenko-like polyline >> snapped km", () => {
    const path = [
      { lat: 50.45, lng: 30.52 },
      { lat: 50.55, lng: 30.62 },
      { lat: 50.45, lng: 30.52 },
      { lat: 50.55, lng: 30.62 },
      { lat: 50.45, lng: 30.52 },
    ];
    assert.equal(isPathDistanceInconsistent(path, 15.6), true);
    assert.equal(isPathDistanceInconsistent(path, 50), false);
  });
});

describe("dedupeRepeatedPathLegs", () => {
  it("collapses Bondarenko-like duplicate long hops", () => {
    const a = { lat: 50.45, lng: 30.52 };
    const b = { lat: 50.55, lng: 30.62 };
    const duplicated = [a, b, a, b, a, b, a, b];
    const deduped = dedupeRepeatedPathLegs(duplicated);
    assert.equal(deduped.length, 2);
    assert.deepEqual(deduped[0], a);
    assert.deepEqual(deduped[1], b);
    assert.equal(isPathDistanceInconsistent(deduped, 15.6), false);
  });
});

describe("reconcileSnapPathDisplay", () => {
  it("Bondarenko fixture: duplicate hops fail raw, pass after reconcile", () => {
    const a = { lat: 50.45, lng: 30.52 };
    const b = { lat: 50.55, lng: 30.62 };
    const duplicated = [a, b, a, b, a, b, a, b];
    assert.equal(isPathDistanceInconsistent(duplicated, 15.6), true);

    const reconciled = reconcileSnapPathDisplay(duplicated, 15.6);
    assert.equal(reconciled.pathDistanceMismatch, false);
    assert.ok(reconciled.path.length >= 2);
    assert.equal(isPathDistanceInconsistent(reconciled.path, 15.6), false);
  });

  it("omits path when still inconsistent after dedupe", () => {
    const path = [
      { lat: 50.45, lng: 30.52 },
      { lat: 50.75, lng: 30.92 },
      { lat: 50.45, lng: 30.52 },
      { lat: 50.75, lng: 30.92 },
    ];
    const reconciled = reconcileSnapPathDisplay(path, 5);
    assert.equal(reconciled.pathDistanceMismatch, true);
    assert.deepEqual(reconciled.path, []);
  });
});

describe("mergeSnapPathsForDisplay", () => {
  it("concatenates chunk and bridge paths without stitch duplication", () => {
    const a = [{ lat: 50.4, lng: 30.5 }, { lat: 50.41, lng: 30.51 }];
    const b = [{ lat: 50.5, lng: 30.6 }, { lat: 50.51, lng: 30.61 }];
    const bridge = [
      { lat: 50.41, lng: 30.51 },
      { lat: 50.45, lng: 30.55 },
      { lat: 50.5, lng: 30.6 },
    ];
    const out = mergeSnapPathsForDisplay([a, b], [bridge]);
    assert.ok(out.length >= 4);
    assert.ok(out.length <= 6);
  });
});

describe("Gribovskaya fixture path", () => {
  it("12-point clusters stitched without segment > 1 km", async () => {
    const samples = gribovskayaSamples();
    const chunks = splitSamplesByTimeGap(samples, 30);
    const chunkPaths = chunks.map((c) => c.map((s) => ({ lat: s.lat, lng: s.lng })));
    const merged = chunkPaths.flatMap((p, idx) =>
      idx === 0 ? p : [p[0]!, ...p.slice(1)],
    );

    const mockRoadLeg = async (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
      const steps = 25;
      return {
        path: Array.from({ length: steps + 1 }, (_, i) => ({
          lat: a.lat + ((b.lat - a.lat) * i) / steps,
          lng: a.lng + ((b.lng - a.lng) * i) / steps,
        })),
      };
    };

    let path = merged;
    for (let i = 1; i < chunkPaths.length; i++) {
      const bridge = await stitchPathGaps(
        [chunkPaths[i - 1]!.at(-1)!, chunkPaths[i]![0]!],
        mockRoadLeg,
        STITCH_GAP_THRESHOLD_KM,
      );
      path = [...path.slice(0, -1), ...bridge.path];
    }

    const innerStitch = await stitchPathGaps(path, mockRoadLeg, STITCH_GAP_THRESHOLD_KM);
    assert.ok(innerStitch.maxStitchGapKm <= 1);
    assert.equal(innerStitch.hasUnfilledGaps, false);
  });
});
