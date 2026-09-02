import test from "node:test";
import assert from "node:assert/strict";
import { computeProductVelocity } from "../demand-velocity.util";

test("avgMonthly divides by lookback even when some months are zero", () => {
  const { avgMonthlySold, forecastDemand, velocitySource } = computeProductVelocity({
    totalSoldInLookback: 0,
    totalOrderQtyInLookback: 60,
    lookbackMonths: 6,
    coverMonths: 3,
  });
  assert.equal(avgMonthlySold, 10);
  assert.equal(forecastDemand, 30);
  assert.equal(velocitySource, "crm_orders");
});

test("CRM wins over XLS sales history", () => {
  const { avgMonthlySold, velocitySource } = computeProductVelocity({
    totalSoldInLookback: 48,
    totalOrderQtyInLookback: 120,
    lookbackMonths: 6,
    coverMonths: 3,
  });
  assert.equal(avgMonthlySold, 20);
  assert.equal(velocitySource, "crm_orders");
});

test("XLS fallback when no CRM shipments", () => {
  const { avgMonthlySold, velocitySource } = computeProductVelocity({
    totalSoldInLookback: 30,
    totalOrderQtyInLookback: 0,
    lookbackMonths: 6,
    coverMonths: 3,
  });
  assert.equal(avgMonthlySold, 5);
  assert.equal(velocitySource, "sales_history");
});

test("override replaces velocity from CRM and XLS", () => {
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
  assert.equal(velocitySource, "crm_orders");
});
