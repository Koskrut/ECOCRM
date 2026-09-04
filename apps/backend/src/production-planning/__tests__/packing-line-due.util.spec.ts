import test from "node:test";
import assert from "node:assert/strict";

/** Mirrors PackingListService.updateCycleEnd line due propagation rule. */
function shouldPropagateLineDue(lineDueAt: Date | null, oldCycleEnd: Date): boolean {
  const dueMs = lineDueAt?.getTime() ?? null;
  return dueMs == null || dueMs === oldCycleEnd.getTime();
}

test("line due defaults propagate when null or equal to old cycleEnd", () => {
  const oldEnd = new Date("2026-09-05T21:00:00.000Z");
  const nextEnd = new Date("2026-09-12T21:00:00.000Z");
  assert.equal(shouldPropagateLineDue(null, oldEnd), true);
  assert.equal(shouldPropagateLineDue(oldEnd, oldEnd), true);
  assert.equal(shouldPropagateLineDue(nextEnd, oldEnd), false);
});
