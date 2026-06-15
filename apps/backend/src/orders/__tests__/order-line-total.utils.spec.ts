import assert from "node:assert/strict";
import test from "node:test";
import {
  computeLineGross,
  computeLineTotal,
} from "../order-line-total.utils";

test("computeLineTotal without discount equals gross", () => {
  assert.equal(computeLineTotal(2, 50, 0), 100);
  assert.equal(computeLineGross(2, 50), 100);
});

test("computeLineTotal applies percent discount", () => {
  assert.equal(computeLineTotal(2, 100, 10), 180);
  assert.equal(computeLineTotal(3, 100, 5), 285);
  assert.equal(computeLineTotal(1, 200, 30), 140);
});

test("computeLineTotal clamps invalid percent", () => {
  assert.equal(computeLineTotal(1, 100, -5), 100);
  assert.equal(computeLineTotal(1, 100, 150), 0);
});

test("combined line and order discount totals", () => {
  const items = [
    { qty: 2, price: 100, discountPercent: 10, lineTotal: computeLineTotal(2, 100, 10) },
    { qty: 1, price: 50, discountPercent: 0, lineTotal: computeLineTotal(1, 50, 0) },
  ];
  const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
  const manualDiscount = 10;
  const total = subtotal - manualDiscount;
  assert.equal(subtotal, 230);
  assert.equal(total, 220);
});
