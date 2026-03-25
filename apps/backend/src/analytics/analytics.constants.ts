import { OrderStage } from "@prisma/client";

/** Excluded from Booked Revenue and period order counts */
export const ANALYTICS_EXCLUDED_ORDER_STAGES: OrderStage[] = ["CANCELED", "REFUSED"];

/** Terminal / closed for stuck-order detection */
export const ANALYTICS_STUCK_EXCLUDED_STAGES: OrderStage[] = [
  "CANCELED",
  "REFUSED",
  "COMPLETED",
];

/** Days without stage change to count as stuck */
export const ANALYTICS_STUCK_DAYS = 3;

/** Lead "no touch" thresholds (days) */
export const LEAD_NO_TOUCH_DAYS_NEW = 3;
export const LEAD_NO_TOUCH_DAYS_IN_PROGRESS = 7;
