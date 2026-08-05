import test from "node:test";
import assert from "node:assert/strict";
import {
  effectiveSafetyStock,
  forecastQtyForDays,
  monthsAgoUtc,
} from "../planning-safety.util";

test("effectiveSafetyStock treats 0 as unset and uses safetyMonths", () => {
  assert.equal(effectiveSafetyStock(0, 100, 0.5), 50);
  assert.equal(effectiveSafetyStock(null, 100, 0.5), 50);
  assert.equal(effectiveSafetyStock(20, 100, 0.5), 20);
});

test("forecastQtyForDays scales avg monthly to horizon days", () => {
  assert.equal(forecastQtyForDays(30, 90), 90);
  assert.equal(forecastQtyForDays(10, 14), 5);
});

test("monthsAgoUtc returns first day of month", () => {
  const d = monthsAgoUtc(2, new Date(Date.UTC(2025, 2, 15)));
  assert.equal(d.toISOString(), "2025-01-01T00:00:00.000Z");
});
