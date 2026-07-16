import test from "node:test";
import assert from "node:assert/strict";
import {
  filterPlanningRelevantEntries,
  normalizeSnapshotSku,
} from "../inventory-snapshot.service";

test("normalizeSnapshotSku strips leading backtick", () => {
  assert.equal(normalizeSnapshotSku("`KIT-001"), "KIT-001");
  assert.equal(normalizeSnapshotSku("  PART-A  "), "PART-A");
});

test("filterPlanningRelevantEntries keeps kits and BOM parts only", () => {
  const relevant = new Set(["KIT-001", "PART-A", "PART-B"]);
  const { kept, skippedIrrelevant } = filterPlanningRelevantEntries(
    [
      { skuNormalized: "KIT-001", qty: 10 },
      { skuNormalized: "PART-A", qty: 100 },
      { skuNormalized: "LEFT-JUNK", qty: 999 },
      { skuNormalized: "OTHER-WH", qty: 1 },
      { skuNormalized: "PART-B", qty: 5 },
    ],
    relevant,
  );
  assert.equal(kept.length, 3);
  assert.equal(skippedIrrelevant, 2);
  assert.deepEqual(
    kept.map((k) => k.skuNormalized),
    ["KIT-001", "PART-A", "PART-B"],
  );
});
