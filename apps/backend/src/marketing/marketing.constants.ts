export const MARKETING_PROVIDERS = {
  META: "marketing_meta",
  GOOGLE: "marketing_google",
  TIKTOK: "marketing_tiktok",
} as const;

/** Flags live here even before any cabinet is saved. */
export const MARKETING_FLAGS_PROVIDER = "marketing_flags";

export type CabinetPlatform = keyof typeof MARKETING_PROVIDERS;

export const META_DIRECT_LABEL = "Реклама Meta";

export const DEFAULT_PAYMENT_WINDOW_DAYS = 30;
export const PAYMENT_WINDOWS = [7, 30, 90] as const;
export type PaymentWindowDays = (typeof PAYMENT_WINDOWS)[number];

export const MIN_SPEND_ALERT = 1000;
export const CONTACT_HOURS_ALERT = 2;
export const JUNK_SHARE_ALERT = 0.5;
export const JUNK_MIN_RESOLVED = 10;
export const AUDIENCE_STALE_DAYS = 7;
export const CPL_GROWTH_ALERT = 3;
export const META_AUDIENCE_MIN = 100;
export const OTHER_AUDIENCE_MIN = 1000;
export const LOOKALIKE_MIN = 100;
export const DORMANT_DAYS_DEFAULT = 90;

export const REAL_MONEY_SOURCES = ["BANK", "CASH", "ONE_C"] as const;

export function isPaymentWindow(value: number): value is PaymentWindowDays {
  return value === 7 || value === 30 || value === 90;
}
