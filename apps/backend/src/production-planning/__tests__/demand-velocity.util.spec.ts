import test from "node:test";
import assert from "node:assert/strict";

/** Mirrors DemandForecastService velocity math for unit tests. */
export function computeVelocityForecast(
  totalSoldInLookback: number,
  lookbackMonths: number,
  coverMonths: number,
  override?: number | null,
) {
  const avgMonthlySold =
    override != null && Number.isFinite(override)
      ? Math.max(0, override)
      : totalSoldInLookback / Math.max(1, lookbackMonths);
  return {
    avgMonthlySold,
    forecastDemand: Math.ceil(avgMonthlySold * coverMonths),
  };
}

test("avgMonthly divides by lookback even when some months are zero", () => {
  const { avgMonthlySold, forecastDemand } = computeVelocityForecast(60, 6, 3);
  assert.equal(avgMonthlySold, 10);
  assert.equal(forecastDemand, 30);
});

test("override replaces velocity from sales", () => {
  const { avgMonthlySold, forecastDemand } = computeVelocityForecast(0, 6, 3, 12);
  assert.equal(avgMonthlySold, 12);
  assert.equal(forecastDemand, 36);
});
