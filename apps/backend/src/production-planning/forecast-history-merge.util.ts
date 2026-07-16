/** Pure helpers for merging Excel sales history with CRM shipments into monthly buckets. */

export function monthKeyUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Excel months always win (including net ≤0 after returns). CRM fills only unmarked months.
 * Negative Excel nets are stored as 0 so averages see a covered empty month.
 */
export function mergeMonthlySalesHistory(params: {
  excelRows: Array<{ productId: string; soldAt: Date; qty: number }>;
  crmRows: Array<{ productId: string; soldAt: Date; qty: number }>;
}): Map<string, Map<string, number>> {
  const monthly = new Map<string, Map<string, number>>();
  const historyMonths = new Set<string>();

  const ensure = (productId: string) => {
    let inner = monthly.get(productId);
    if (!inner) {
      inner = new Map();
      monthly.set(productId, inner);
    }
    return inner;
  };

  for (const row of params.excelRows) {
    if (!row.productId) continue;
    const key = monthKeyUtc(row.soldAt);
    historyMonths.add(`${row.productId}|${key}`);
    const inner = ensure(row.productId);
    inner.set(key, (inner.get(key) ?? 0) + Math.max(0, row.qty));
  }

  for (const row of params.crmRows) {
    if (!row.productId || row.qty <= 0) continue;
    const key = monthKeyUtc(row.soldAt);
    if (historyMonths.has(`${row.productId}|${key}`)) continue;
    const inner = ensure(row.productId);
    inner.set(key, (inner.get(key) ?? 0) + row.qty);
  }

  return monthly;
}
