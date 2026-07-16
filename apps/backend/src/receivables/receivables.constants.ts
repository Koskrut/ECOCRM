/** Tolerance for ALIGNED status (base currency units). */
export const RECEIVABLES_DELTA_TOLERANCE = 0.01;

/** Default currency for 1C Excel amounts (report is in USD). */
export const RECEIVABLES_1C_AMOUNT_CURRENCY = "USD";

export const RECEIVABLES_1C_ALLOWED_CURRENCIES = ["USD", "UAH"] as const;
export type Receivables1CCurrency = (typeof RECEIVABLES_1C_ALLOWED_CURRENCIES)[number];
