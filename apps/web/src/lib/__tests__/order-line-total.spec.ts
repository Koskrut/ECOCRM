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

test("BUY_100_GET_30 short lines with group eligibility", () => {
  const a = computeLinePricing(50, 16, 0, ORDER_PROMO_BUY_100_GET_30, 130);
  const b = computeLinePricing(80, 16, 0, ORDER_PROMO_BUY_100_GET_30, 130);
  assert.equal(a.lineTotal + b.lineTotal, 1600);
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

test("catalog overrides builtin pay ratio", () => {
  const catalog = [
    {
      id: ORDER_PROMO_BUY_100_GET_30,
      name: "10+2",
      enabled: true,
      kind: "pay_ratio" as const,
      minQty: 12,
      payUnits: 10,
      bundleUnits: 12,
      unitOff: 0,
    },
  ];
  const p = computeLinePricing(12, 12, 0, ORDER_PROMO_BUY_100_GET_30, 12, catalog);
  assert.equal(p.lineTotal, 120);
  assert.equal(p.promoType, ORDER_PROMO_BUY_100_GET_30);
});
