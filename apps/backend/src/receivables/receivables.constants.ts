import type { OrderStage } from "@prisma/client";

/**
 * Stages that count toward CRM receivables (debt).
 * Debt starts only once the order is ready to ship — earlier pipeline stages are excluded.
 */
export const RECEIVABLES_DEBT_ORDER_STAGES: readonly OrderStage[] = [
  "READY_TO_SHIP",
  "SHIPPED",
  "AWAITING_RECEIPT",
  "RECEIVED",
  "COMPLETED",
  "RETURN_IN_PROGRESS",
] as const;

/** Tolerance for ALIGNED status (base currency units). */
export const RECEIVABLES_DELTA_TOLERANCE = 0.01;

/** Default currency for 1C Excel amounts (report is in USD). */
export const RECEIVABLES_1C_AMOUNT_CURRENCY = "USD";

export const RECEIVABLES_1C_ALLOWED_CURRENCIES = ["USD", "UAH"] as const;
export type Receivables1CCurrency = (typeof RECEIVABLES_1C_ALLOWED_CURRENCIES)[number];
