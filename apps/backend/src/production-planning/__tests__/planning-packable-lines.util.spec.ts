import assert from "node:assert/strict";
import test from "node:test";
import {
  filterPackableProposedLines,
  isPackableFromParts,
} from "../planning-packable-lines.util";

test("isPackableFromParts requires positive part stock", () => {
  assert.equal(isPackableFromParts(0), false);
  assert.equal(isPackableFromParts(-1), false);
  assert.equal(isPackableFromParts(3), true);
});

test("filterPackableProposedLines drops zero maxFromParts and keeps packable kits", () => {
  const kept = filterPackableProposedLines([
    { kitProductId: "a", maxFromParts: 0, qtyApproved: 0 },
    { kitProductId: "b", maxFromParts: 4, qtyApproved: 4 },
    { kitProductId: "c", maxFromParts: 2, qtyApproved: 1 },
  ]);
  assert.deepEqual(
    kept.map((l) => l.kitProductId),
    ["b", "c"],
  );
  assert.equal(kept[0]!.qtyApproved, 4);
});
