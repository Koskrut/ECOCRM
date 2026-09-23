/**
 * Receivables aging buckets (days past paymentDueDate).
 * 90+ covers all debt older than 60 days (incl. 61–89).
 */
export const RECEIVABLES_AGING_BUCKET_LABELS = ["0-7", "8-30", "31-60", "90+"] as const;

export type ReceivablesAgingBucketLabel = (typeof RECEIVABLES_AGING_BUCKET_LABELS)[number];

export type AgingBucketAccumulator = {
  label: ReceivablesAgingBucketLabel;
  amount: number;
  clientsCount: number;
  ordersCount: number;
};

export function agingBucketIndex(daysPastDue: number): number {
  if (daysPastDue <= 7) return 0;
  if (daysPastDue <= 30) return 1;
  if (daysPastDue <= 60) return 2;
  return 3;
}

export function createEmptyAgingBuckets(): AgingBucketAccumulator[] {
  return RECEIVABLES_AGING_BUCKET_LABELS.map((label) => ({
    label,
    amount: 0,
    clientsCount: 0,
    ordersCount: 0,
  }));
}

export function accumulateAgingAmount(
  buckets: AgingBucketAccumulator[],
  daysPastDue: number,
  amount: number,
): void {
  if (daysPastDue < 0 || !(amount > 0)) return;
  const idx = agingBucketIndex(daysPastDue);
  buckets[idx]!.amount += amount;
  buckets[idx]!.ordersCount += 1;
}
