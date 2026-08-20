/** ±1 minute window for DB unique index dedup (double-click). */
export const CASH_PAYMENT_DEDUP_WINDOW_MS = 60_000;

/** Wider window for user-facing duplicate confirmation. */
export const CASH_PAYMENT_CONFIRM_DEDUP_WINDOW_MS = 10 * 60_000;

export function cashPaymentPaidAtWindow(paidAt: Date): { gte: Date; lte: Date } {
  return {
    gte: new Date(paidAt.getTime() - CASH_PAYMENT_DEDUP_WINDOW_MS),
    lte: new Date(paidAt.getTime() + CASH_PAYMENT_DEDUP_WINDOW_MS),
  };
}

export function cashPaymentConfirmDedupWindow(paidAt: Date): { gte: Date; lte: Date } {
  return {
    gte: new Date(paidAt.getTime() - CASH_PAYMENT_CONFIRM_DEDUP_WINDOW_MS),
    lte: new Date(paidAt.getTime() + CASH_PAYMENT_CONFIRM_DEDUP_WINDOW_MS),
  };
}
