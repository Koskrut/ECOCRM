import assert from "node:assert/strict";
import test from "node:test";
import {
  filterPackableProposedLines,
  isBlockedPackLine,
  isPackableFromParts,
} from "../planning-packable-lines.util";

test("isPackableFromParts requires positive part stock", () => {
  assert.equal(isPackableFromParts(0), false);
  assert.equal(isPackableFromParts(-1), false);
  assert.equal(isPackableFromParts(3), true);
});

test("filterPackableProposedLines keeps packable kits and blocked need", () => {
  const kept = filterPackableProposedLines([
    { kitProductId: "a", maxFromParts: 0, qtyApproved: 0, targetPack: 40 },
    { kitProductId: "b", maxFromParts: 4, qtyApproved: 4, targetPack: 4 },
    { kitProductId: "c", maxFromParts: 0, qtyApproved: 0, targetPack: 0 },
  ]);
  assert.deepEqual(
    kept.map((l) => l.kitProductId),
    ["a", "b"],
  );
  assert.equal(isBlockedPackLine(kept[0]!), true);
  assert.equal(kept[1]!.qtyApproved, 4);
});
