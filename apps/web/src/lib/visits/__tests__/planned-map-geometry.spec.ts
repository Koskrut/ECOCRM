import assert from "node:assert/strict";
import test from "node:test";

/** Mirrors apps/web/src/lib/visits/planned-map-geometry.ts */
function selectPlannedMapGeometry(opts: {
  hasUnsavedPlanOrder: boolean;
  preview: { source: string } | null;
  saved: { source: string } | null;
}): { source: string } | null {
  if (opts.hasUnsavedPlanOrder) return opts.preview;
  return opts.saved;
}

test("selectPlannedMapGeometry uses saved OSRM geometry when order is saved", () => {
  const saved = { source: "osrm" };
  const preview = { source: "fallback" };
  assert.equal(
    selectPlannedMapGeometry({ hasUnsavedPlanOrder: false, preview, saved }),
    saved,
  );
});

test("selectPlannedMapGeometry uses preview only while order is unsaved", () => {
  const saved = { source: "osrm" };
  const preview = { source: "fallback" };
  assert.equal(
    selectPlannedMapGeometry({ hasUnsavedPlanOrder: true, preview, saved }),
    preview,
  );
});

test("selectPlannedMapGeometry does not fall back to preview when saved order is current", () => {
  const preview = { source: "fallback" };
  assert.equal(
    selectPlannedMapGeometry({ hasUnsavedPlanOrder: false, preview, saved: null }),
    null,
  );
});
