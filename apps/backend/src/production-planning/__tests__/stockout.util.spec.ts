import test from "node:test";
import assert from "node:assert/strict";
import { computeStockouts } from "../stockout.util";

test("computeStockouts counts kits and parts with zero stock", () => {
  const result = computeStockouts({
    kits: [
      {
        productId: "k1",
        sku: "KIT-A",
        name: "Kit A",
        inPareto80: true,
        stockFinished: 0,
        maxBuildNow: 0,
      },
      {
        productId: "k2",
        sku: "KIT-B",
        name: "Kit B",
        inPareto80: false,
        stockFinished: 5,
        maxBuildNow: 10,
      },
      {
        productId: "k3",
        sku: "KIT-C",
        name: "Kit C",
        inPareto80: true,
        stockFinished: 0,
        maxBuildNow: 6,
      },
    ],
    parts: [
      {
        productId: "p1",
        sku: "PART-1",
        name: "Part 1",
        qty: 0,
        inPareto80: true,
      },
    ],
  });

  assert.equal(result.zeroCount, 3);
  assert.equal(result.paretoZeroCount, 3);
  assert.equal(result.zeroFinishedBlocked.length, 1);
  assert.equal(result.zeroFinishedBuildable.length, 1);
  assert.equal(result.paretoZeroFinishedBlocked, 1);
  assert.equal(result.paretoZeroFinishedBuildable, 1);
});

test("computeStockouts treats missing snapshot qty as zero for parts list", () => {
  const result = computeStockouts({
    kits: [],
    parts: [{ productId: "p1", sku: "P", name: "P", qty: 0, inPareto80: false }],
  });
  assert.equal(result.zeroCount, 1);
  assert.equal(result.paretoZeroCount, 0);
});
