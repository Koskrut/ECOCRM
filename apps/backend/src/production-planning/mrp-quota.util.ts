export type QuotaCandidate = {
  key: string;
  productId: string;
  /** Parts-equivalent qty to launch (PART qty, or KIT-without-BOM as 1 part each). */
  partsQty: number;
  priority: number;
  deficit: number;
};

export type QuotaSlice = {
  key: string;
  productId: string;
  suggestedLaunchQty: number;
  monthBucket: number;
  month0Qty: number;
  overflowed: boolean;
  partsQty: number;
  priority: number;
};

/**
 * Slice production demand into monthly capacity buckets.
 * Priority: lower number first; within same priority, higher deficit first.
 */
export function allocateMonthlyQuota(
  candidates: QuotaCandidate[],
  monthlyPartsQuota: number,
  monthsAhead = 6,
): QuotaSlice[] {
  const quota = Math.max(1, Math.floor(monthlyPartsQuota));
  const sorted = [...candidates]
    .filter((c) => c.partsQty > 0)
    .sort((a, b) => a.priority - b.priority || b.deficit - a.deficit || a.key.localeCompare(b.key));

  const remaining = Array.from({ length: monthsAhead }, () => quota);
  const out: QuotaSlice[] = [];

  for (const c of sorted) {
    let left = Math.ceil(c.partsQty);
    let firstBucket: number | null = null;
    let placed = 0;
    let month0Qty = 0;

    for (let m = 0; m < monthsAhead && left > 0; m++) {
      const room = remaining[m] ?? 0;
      if (room <= 0) continue;
      const take = Math.min(room, left);
      remaining[m] = room - take;
      left -= take;
      placed += take;
      if (m === 0) month0Qty += take;
      if (firstBucket == null) firstBucket = m;
    }

    if (placed <= 0) {
      out.push({
        key: c.key,
        productId: c.productId,
        suggestedLaunchQty: 0,
        monthBucket: monthsAhead,
        month0Qty: 0,
        overflowed: true,
        partsQty: c.partsQty,
        priority: c.priority,
      });
      continue;
    }

    out.push({
      key: c.key,
      productId: c.productId,
      suggestedLaunchQty: placed,
      monthBucket: firstBucket ?? 0,
      month0Qty,
      overflowed: left > 0,
      partsQty: c.partsQty,
      priority: c.priority,
    });
  }

  return out;
}

export function coverStatus(
  coverDays: number,
  warnCoverDays: number,
  criticalCoverDays: number,
): "OK" | "WARN" | "CRITICAL" {
  if (coverDays < criticalCoverDays) return "CRITICAL";
  if (coverDays < warnCoverDays) return "WARN";
  return "OK";
}

export function coverDays(available: number, avgDailySold: number): number {
  const daily = avgDailySold > 0 ? avgDailySold : 1e-9;
  return available / daily;
}
