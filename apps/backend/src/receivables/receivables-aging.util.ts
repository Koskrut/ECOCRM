/** Receivables aging buckets (days past paymentDueDate), computed per overdue order. */
export const RECEIVABLES_AGING_BUCKET_LABELS = ["0-7", "8-30", "31-60", "61-90", "90+"] as const;

export type ReceivablesAgingBucketLabel = (typeof RECEIVABLES_AGING_BUCKET_LABELS)[number];

/** Inclusive day ranges per bucket; `max: null` = open-ended. */
export const RECEIVABLES_AGING_BUCKET_RANGES: Record<
  ReceivablesAgingBucketLabel,
  { min: number; max: number | null }
> = {
  "0-7": { min: 0, max: 7 },
  "8-30": { min: 8, max: 30 },
  "31-60": { min: 31, max: 60 },
  "61-90": { min: 61, max: 90 },
  "90+": { min: 91, max: null },
};

export type AgingBucketAccumulator = {
  label: ReceivablesAgingBucketLabel;
  amount: number;
  clientsCount: number;
  ordersCount: number;
};

export function isAgingBucketLabel(value: string | null | undefined): value is ReceivablesAgingBucketLabel {
  return Boolean(value && (RECEIVABLES_AGING_BUCKET_LABELS as readonly string[]).includes(value));
}

export function agingBucketIndex(daysPastDue: number): number {
  if (daysPastDue <= 7) return 0;
  if (daysPastDue <= 30) return 1;
  if (daysPastDue <= 60) return 2;
  if (daysPastDue <= 90) return 3;
  return 4;
}

export function agingBucketLabel(daysPastDue: number): ReceivablesAgingBucketLabel {
  return RECEIVABLES_AGING_BUCKET_LABELS[agingBucketIndex(daysPastDue)]!;
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

export type AgingOverdueOrder = { days: number; amount: number };

/** Per-order aging: each overdue order lands in its own bucket; clientsCount = distinct clients per bucket. */
export function buildAgingBuckets(
  clients: Iterable<{ contactId: string; overdueOrders: AgingOverdueOrder[] }>,
): AgingBucketAccumulator[] {
  const buckets = createEmptyAgingBuckets();
  const clientsByBucket = buckets.map(() => new Set<string>());
  for (const client of clients) {
    for (const order of client.overdueOrders) {
      if (!(order.amount > 0) || order.days <= 0) continue;
      const idx = agingBucketIndex(order.days);
      buckets[idx]!.amount += order.amount;
      buckets[idx]!.ordersCount += 1;
      clientsByBucket[idx]!.add(client.contactId);
    }
  }
  return buckets.map((b, i) => ({
    ...b,
    amount: Math.round(b.amount * 100) / 100,
    clientsCount: clientsByBucket[i]!.size,
  }));
}
