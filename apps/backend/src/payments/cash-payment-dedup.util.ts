/** ±1 minute window for matching duplicate manual/cash payments. */
export const CASH_PAYMENT_DEDUP_WINDOW_MS = 60_000;

export function cashPaymentPaidAtWindow(paidAt: Date): { gte: Date; lte: Date } {
  return {
    gte: new Date(paidAt.getTime() - CASH_PAYMENT_DEDUP_WINDOW_MS),
    lte: new Date(paidAt.getTime() + CASH_PAYMENT_DEDUP_WINDOW_MS),
  };
}
