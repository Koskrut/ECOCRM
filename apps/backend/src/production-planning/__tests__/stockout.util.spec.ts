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
      },
      {
        productId: "k2",
        sku: "KIT-B",
        name: "Kit B",
        inPareto80: false,
        stockFinished: 5,
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
      {
        productId: "p2",
        sku: "PART-2",
        name: "Part 2",
        qty: 3,
        inPareto80: false,
      },
    ],
  });

  assert.equal(result.zeroCount, 2);
  assert.equal(result.paretoZeroCount, 2);
  assert.equal(result.zeroKits.length, 1);
  assert.equal(result.zeroParts.length, 1);
  assert.equal(result.zeroKits[0]?.inPareto80, true);
});

test("computeStockouts treats missing snapshot qty as zero for parts list", () => {
  const result = computeStockouts({
    kits: [],
    parts: [{ productId: "p1", sku: "P", name: "P", qty: 0, inPareto80: false }],
  });
  assert.equal(result.zeroCount, 1);
  assert.equal(result.paretoZeroCount, 0);
});

test("computeStockouts pareto count ignores non-A zero kits", () => {
  const result = computeStockouts({
    kits: [
      {
        productId: "k1",
        sku: "KIT-C",
        name: "Kit C",
        inPareto80: false,
        stockFinished: 0,
      },
    ],
    parts: [],
  });
  assert.equal(result.zeroCount, 1);
  assert.equal(result.paretoZeroCount, 0);
});
