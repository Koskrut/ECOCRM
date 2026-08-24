import assert from "node:assert/strict";
import test from "node:test";
import {
  computeLinePricing,
  computeLineTotal,
  ORDER_PROMO_BUY_100_GET_30,
  ORDER_PROMO_QTY_25_MINUS_2,
} from "../order-line-total";

test("percent discount unchanged", () => {
  assert.equal(computeLineTotal(2, 100, 10), 180);
});

test("BUY_100_GET_30 matches 1600/130 unit price", () => {
  const p = computeLinePricing(130, 16, 0, ORDER_PROMO_BUY_100_GET_30);
  assert.equal(p.lineTotal, 1600);
  assert.equal(p.effectiveUnitPrice, 1600 / 130);
});

test("QTY_25_MINUS_2 subtracts 2 per unit", () => {
  const p = computeLinePricing(25, 16, 0, ORDER_PROMO_QTY_25_MINUS_2);
  assert.equal(p.lineTotal, 350);
  assert.equal(p.effectiveUnitPrice, 14);
});

test("inapplicable promo falls back to percent on client", () => {
  const p = computeLinePricing(20, 16, 10, ORDER_PROMO_QTY_25_MINUS_2);
  assert.equal(p.promoType, null);
  assert.equal(p.lineTotal, computeLineTotal(20, 16, 10));
});
