import {
  RECEIVABLES_AGING_LABELS,
  type ReceivablesAgingLabel,
} from "@/lib/api/resources/receivables";

export type AgingChip = "" | ReceivablesAgingLabel;

export const AGING_CHIPS: AgingChip[] = ["", ...RECEIVABLES_AGING_LABELS];

export const AGING_BUCKET_ORDER = [...RECEIVABLES_AGING_LABELS] as const;

export function matchesAging(days: number | undefined, chip: AgingChip): boolean {
  if (!chip) return true;
  const d = Math.max(Number(days) || 0, 0);
  if (chip === "0-7") return d <= 7;
  if (chip === "8-30") return d >= 8 && d <= 30;
  if (chip === "31-60") return d >= 31 && d <= 60;
  if (chip === "61-90") return d >= 61 && d <= 90;
  return d > 90;
}

export function matchesAgingBucket(
  bucket: ReceivablesAgingLabel | string | null | undefined,
  chip: AgingChip,
): boolean {
  if (!chip) return true;
  return bucket === chip;
}
