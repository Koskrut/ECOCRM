/** Pure helpers for merging Excel sales history with CRM demand into monthly buckets. */

export function monthKeyUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type MergeMonthlySalesMode = "crm_first" | "excel_first";

/**
 * CRM-first (default): CRM months win; Excel fills only unmarked productId|YYYY-MM gaps
 * (pre-CRM history, young SKUs, proven coverage holes).
 * excel_first kept for legacy tests / emergency rollback.
 * Negative nets are stored as 0 so averages see a covered empty month.
 */
export function mergeMonthlySalesHistory(params: {
  excelRows: Array<{ productId: string; soldAt: Date; qty: number }>;
  crmRows: Array<{ productId: string; soldAt: Date; qty: number }>;
  mode?: MergeMonthlySalesMode;
}): Map<string, Map<string, number>> {
  const mode = params.mode ?? "crm_first";
  const monthly = new Map<string, Map<string, number>>();
  const covered = new Set<string>();

  const ensure = (productId: string) => {
    let inner = monthly.get(productId);
    if (!inner) {
      inner = new Map();
      monthly.set(productId, inner);
    }
    return inner;
  };

  const applyPrimary = (
    rows: Array<{ productId: string; soldAt: Date; qty: number }>,
    allowZero: boolean,
  ) => {
    for (const row of rows) {
      if (!row.productId) continue;
      if (!allowZero && row.qty <= 0) continue;
      const key = monthKeyUtc(row.soldAt);
      covered.add(`${row.productId}|${key}`);
      const inner = ensure(row.productId);
      inner.set(key, (inner.get(key) ?? 0) + Math.max(0, row.qty));
    }
  };

  const applyGapFill = (
    rows: Array<{ productId: string; soldAt: Date; qty: number }>,
    allowZero: boolean,
  ) => {
    for (const row of rows) {
      if (!row.productId) continue;
      if (!allowZero && row.qty <= 0) continue;
      const key = monthKeyUtc(row.soldAt);
      if (covered.has(`${row.productId}|${key}`)) continue;
      covered.add(`${row.productId}|${key}`);
      const inner = ensure(row.productId);
      inner.set(key, (inner.get(key) ?? 0) + Math.max(0, row.qty));
    }
  };

  if (mode === "excel_first") {
    applyPrimary(params.excelRows, true);
    applyGapFill(params.crmRows, false);
  } else {
    applyPrimary(params.crmRows, false);
    applyGapFill(params.excelRows, true);
  }

  return monthly;
}
