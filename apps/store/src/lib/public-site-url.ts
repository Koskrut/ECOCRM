/**
 * Головний публічний сайт (маркетинг). Без next/headers — безпечно імпортувати з "use client".
 * Перевизначення: NEXT_PUBLIC_PUBLIC_SITE_URL (наприклад https://www.suprex.dental).
 */
export const PUBLIC_SITE_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_PUBLIC_SITE_URL?.replace(/\/+$/, "")) ||
  "https://www.suprex.dental";
