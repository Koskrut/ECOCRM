import test from "node:test";
import assert from "node:assert/strict";
import { computeProductVelocity } from "../demand-velocity.util";

test("avgMonthly divides by lookback even when some months are zero", () => {
  const { avgMonthlySold, forecastDemand, velocitySource } = computeProductVelocity({
    totalSoldInLookback: 60,
    totalOrderQtyInLookback: 0,
    lookbackMonths: 6,
    coverMonths: 3,
  });
  assert.equal(avgMonthlySold, 10);
  assert.equal(forecastDemand, 30);
  assert.equal(velocitySource, "sales_history");
});

test("sales wins over OrderItem fallback", () => {
  const { avgMonthlySold, velocitySource } = computeProductVelocity({
    totalSoldInLookback: 48,
    totalOrderQtyInLookback: 120,
    lookbackMonths: 6,
    coverMonths: 3,
  });
  assert.equal(avgMonthlySold, 8);
  assert.equal(velocitySource, "sales_history");
});

test("OrderItem fallback when no sales history", () => {
  const { avgMonthlySold, velocitySource } = computeProductVelocity({
    totalSoldInLookback: 0,
    totalOrderQtyInLookback: 30,
    lookbackMonths: 6,
    coverMonths: 3,
  });
  assert.equal(avgMonthlySold, 5);
  assert.equal(velocitySource, "crm_orders");
});

test("override replaces velocity from sales and orders", () => {
  const { avgMonthlySold, forecastDemand, velocitySource } = computeProductVelocity({
    totalSoldInLookback: 100,
    totalOrderQtyInLookback: 50,
    lookbackMonths: 6,
    coverMonths: 3,
    override: 12,
  });
  assert.equal(avgMonthlySold, 12);
  assert.equal(forecastDemand, 36);
  assert.equal(velocitySource, "override");
});

test("empty history yields zero velocity", () => {
  const { avgMonthlySold, forecastDemand, velocitySource } = computeProductVelocity({
    totalSoldInLookback: 0,
    totalOrderQtyInLookback: 0,
    lookbackMonths: 6,
    coverMonths: 3,
  });
  assert.equal(avgMonthlySold, 0);
  assert.equal(forecastDemand, 0);
  assert.equal(velocitySource, "sales_history");
});
