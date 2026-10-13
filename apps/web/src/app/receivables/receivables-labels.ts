import { strings } from "@/locales";
import type { ReceivablesReconcileStatus } from "@/lib/api/resources/receivables";

export const RECONCILE_STATUSES: ReceivablesReconcileStatus[] = [
  "ALIGNED",
  "DELTA_1C_MORE",
  "DELTA_CRM_MORE",
  "ONLY_1C",
  "ONLY_CRM",
];

/** Includes virtual NO_CODE filter for reconcile status select. */
export const RECONCILE_STATUS_FILTERS = [...RECONCILE_STATUSES, "NO_CODE"] as const;

export const RECONCILE_STATUS_CLASS: Record<ReceivablesReconcileStatus, string> = {
  ALIGNED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  DELTA_1C_MORE: "bg-amber-50 text-amber-800 ring-amber-200",
  DELTA_CRM_MORE: "bg-orange-50 text-orange-800 ring-orange-200",
  ONLY_1C: "bg-red-50 text-red-700 ring-red-200",
  ONLY_CRM: "bg-violet-50 text-violet-800 ring-violet-200",
};

export const DELAY_REASON_CODES = ["WAITING_ACT", "CLIENT_DELAY", "DISPUTE", "OTHER"] as const;

function lookup(map: Record<string, string>, code: string): string {
  return map[code] ?? code;
}

export function reconcileStatusLabel(status: ReceivablesReconcileStatus | "NO_CODE"): string {
  if (status === "NO_CODE") return strings.receivables.reconcileStatusNoCode;
  return lookup(strings.receivables.reconcileStatusLabels, status);
}

export function financialStatusLabel(code: string): string {
  return lookup(strings.receivables.financialStatusLabels, code);
}

/** Short badge label for tables. */
export function delayReasonShortLabel(code: string): string {
  return lookup(strings.receivables.delayReasonShortLabels, code);
}

/** Full label for selects and filter chips. */
export function delayReasonLabel(code: string): string {
  const t = strings.receivables;
  const map: Record<string, string> = {
    WAITING_ACT: t.delayReasonWaitingAct,
    CLIENT_DELAY: t.delayReasonClientDelay,
    DISPUTE: t.delayReasonDispute,
    OTHER: t.delayReasonOther,
  };
  return lookup(map, code);
}
