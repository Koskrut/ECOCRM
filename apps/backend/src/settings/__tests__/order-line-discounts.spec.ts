import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOrderLineDiscountPercents } from "../settings.service";

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
