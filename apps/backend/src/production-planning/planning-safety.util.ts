/** First day of month N months ago (UTC) — stable lookback window for monthly sales. */
export function monthsAgoUtc(months: number, now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
}

/** Per-SKU safety qty override; 0 means use avgMonthly × safetyMonths. */
export function effectiveSafetyStock(
  perSkuSafety: number | null | undefined,
  avgMonthlySold: number,
  safetyMonths: number,
): number {
  if (perSkuSafety != null && perSkuSafety > 0) return perSkuSafety;
  return Math.ceil(Math.max(0, avgMonthlySold) * safetyMonths);
}

/** Convert avg monthly velocity to qty for a day horizon. */
export function forecastQtyForDays(avgMonthlySold: number, horizonDays: number): number {
  return Math.ceil((Math.max(0, avgMonthlySold) * horizonDays) / 30);
}
