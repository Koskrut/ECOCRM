import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeOrderLineDiscountPercents,
  normalizeOrderLinePromos,
} from "../settings.service";

test("normalizeOrderLineDiscountPercents returns defaults for invalid input", () => {
  assert.deepEqual(normalizeOrderLineDiscountPercents(null), [5, 10, 15, 20, 25, 30]);
  assert.deepEqual(normalizeOrderLineDiscountPercents([]), [5, 10, 15, 20, 25, 30]);
});

test("normalizeOrderLineDiscountPercents deduplicates and sorts", () => {
  assert.deepEqual(normalizeOrderLineDiscountPercents([20, 5, 5, 10]), [5, 10, 20]);
});

test("normalizeOrderLineDiscountPercents filters out of range values", () => {
  assert.deepEqual(normalizeOrderLineDiscountPercents([0, 101, 15]), [15]);
});

test("normalizeOrderLinePromos defaults when undefined", () => {
  assert.deepEqual(normalizeOrderLinePromos(undefined), ["BUY_100_GET_30", "QTY_25_MINUS_2"]);
});

test("normalizeOrderLinePromos filters unknown and keeps order of first appearance", () => {
  assert.deepEqual(normalizeOrderLinePromos(["QTY_25_MINUS_2", "NOPE", "BUY_100_GET_30"]), [
    "QTY_25_MINUS_2",
    "BUY_100_GET_30",
  ]);
});

test("normalizeOrderLinePromos allows empty list", () => {
  assert.deepEqual(normalizeOrderLinePromos([]), []);
});
