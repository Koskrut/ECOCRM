import assert from "node:assert/strict";
import test from "node:test";

/** Mirrors apps/web/src/lib/visits/incomplete-tour-copy.ts */
function incompleteTourCopyKind(
  shiftActive: boolean | undefined,
): "open_shift" | "truncated_track" {
  return shiftActive ? "open_shift" : "truncated_track";
}

test("incompleteTourCopyKind splits open shift vs truncated track", () => {
  assert.equal(incompleteTourCopyKind(true), "open_shift");
  assert.equal(incompleteTourCopyKind(false), "truncated_track");
  assert.equal(incompleteTourCopyKind(undefined), "truncated_track");
});
