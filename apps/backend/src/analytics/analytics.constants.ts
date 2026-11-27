/** Void stages — never count toward demand, purchases, or analytics. */
export const ANALYTICS_EXCLUDED_ORDER_STAGES = ["CANCELED", "REFUSED"] as const;

/**
 * Stages excluded from booked revenue / ordersCount on dashboard & analytics.
 * Pre-ship pipeline (NEW … CONFIRMED, incl. AWAITING_STOCK) is not a “real sale” yet —
 * same cut as receivables debt start (READY_TO_SHIP+). Voids stay excluded.
 * Production-planning demand still uses ANALYTICS_EXCLUDED_ORDER_STAGES only.
 */
export const ANALYTICS_BOOKED_EXCLUDED_ORDER_STAGES = [
  ...ANALYTICS_EXCLUDED_ORDER_STAGES,
  "NEW",
  "AWAITING_PAYMENT",
  "AWAITING_STOCK",
  "CONFIRMED",
] as const;

