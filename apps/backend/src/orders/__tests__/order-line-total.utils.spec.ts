import assert from "node:assert/strict";
import test from "node:test";
import {
  computeLineGross,
  computeLinePricing,
  computeLineTotal,
  ORDER_PROMO_BUY_100_GET_30,
  ORDER_PROMO_QTY_25_MINUS_2,
  parsePromoType,
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

test("BUY_100_GET_30: 130 × 16 → lineTotal 1600, unit 1600/130", () => {
  const pricing = computeLinePricing(130, 16, 0, ORDER_PROMO_BUY_100_GET_30);
  assert.equal(pricing.lineTotal, 1600);
  assert.equal(pricing.effectiveUnitPrice, 1600 / 130);
  assert.equal(pricing.discountPercent, 0);
  assert.equal(pricing.promoType, ORDER_PROMO_BUY_100_GET_30);
});

test("BUY_100_GET_30 rejects qty below 130", () => {
  assert.throws(() => computeLinePricing(129, 16, 0, ORDER_PROMO_BUY_100_GET_30), /100\+30/);
});

test("BUY_100_GET_30 drops when dropInapplicable and qty low", () => {
  const pricing = computeLinePricing(100, 16, 10, ORDER_PROMO_BUY_100_GET_30, {
    dropInapplicable: true,
  });
  assert.equal(pricing.promoType, null);
  assert.equal(pricing.lineTotal, computeLineTotal(100, 16, 10));
});

test("QTY_25_MINUS_2: 25 × 16 → unit 14, lineTotal 350", () => {
  const pricing = computeLinePricing(25, 16, 0, ORDER_PROMO_QTY_25_MINUS_2);
  assert.equal(pricing.effectiveUnitPrice, 14);
  assert.equal(pricing.lineTotal, 350);
  assert.equal(pricing.discountPercent, 0);
});

test("QTY_25_MINUS_2 rejects qty below 25", () => {
  assert.throws(() => computeLinePricing(24, 16, 0, ORDER_PROMO_QTY_25_MINUS_2), /−2\$/);
});

test("QTY_25_MINUS_2 clamps unit price at 0 when base < 2", () => {
  const pricing = computeLinePricing(25, 1.5, 0, ORDER_PROMO_QTY_25_MINUS_2);
  assert.equal(pricing.effectiveUnitPrice, 0);
  assert.equal(pricing.lineTotal, 0);
});

test("promo clears percent in pricing result", () => {
  const pricing = computeLinePricing(130, 16, 20, ORDER_PROMO_BUY_100_GET_30);
  assert.equal(pricing.discountPercent, 0);
  assert.equal(pricing.lineTotal, 1600);
});

test("parsePromoType accepts known values and clears NONE", () => {
  assert.equal(parsePromoType(null), null);
  assert.equal(parsePromoType("NONE"), null);
  assert.equal(parsePromoType(""), null);
  assert.equal(parsePromoType(ORDER_PROMO_BUY_100_GET_30), ORDER_PROMO_BUY_100_GET_30);
  assert.throws(() => parsePromoType("UNKNOWN"), /Unknown promoType/);
});
