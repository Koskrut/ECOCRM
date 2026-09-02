export type VelocitySource = "sales_history" | "crm_orders" | "override";

/**
 * CRM-first velocity: override → CRM shipped qty → XLS sales history fallback.
 */
export function computeProductVelocity(input: {
  totalSoldInLookback: number;
  totalOrderQtyInLookback: number;
  lookbackMonths: number;
  coverMonths: number;
  override?: number | null;
}): {
  avgMonthlySold: number;
  forecastDemand: number;
  velocitySource: VelocitySource;
} {
  const { totalSoldInLookback, totalOrderQtyInLookback, lookbackMonths, coverMonths, override } =
    input;
  const denom = Math.max(1, lookbackMonths);

  if (override != null && Number.isFinite(override)) {
    const avgMonthlySold = Math.max(0, override);
    return {
      avgMonthlySold,
      forecastDemand: Math.ceil(avgMonthlySold * coverMonths),
      velocitySource: "override",
    };
  }

  if (totalOrderQtyInLookback > 0) {
    const avgMonthlySold = totalOrderQtyInLookback / denom;
    return {
      avgMonthlySold,
      forecastDemand: Math.ceil(avgMonthlySold * coverMonths),
      velocitySource: "crm_orders",
    };
  }

  if (totalSoldInLookback > 0) {
    const avgMonthlySold = totalSoldInLookback / denom;
    return {
      avgMonthlySold,
      forecastDemand: Math.ceil(avgMonthlySold * coverMonths),
      velocitySource: "sales_history",
    };
  }

  return {
    avgMonthlySold: 0,
    forecastDemand: 0,
    velocitySource: "crm_orders",
  };
}
