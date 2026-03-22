/**
 * Базовий URL CRM (Next `apps/web`), де відкривається `/pay/[token]`.
 * Прод: наприклад https://crm.example.com — без завершального слеша.
 * Локально: web на порту 3000, store на 3002.
 */
/** Повертає порожній рядок, якщо продакшен без NEXT_PUBLIC_CRM_PAY_URL. */
export function getCrmPayPageOrigin(): string {
  const fromEnv =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_CRM_PAY_URL?.replace(/\/+$/, "") : undefined;
  if (fromEnv) return fromEnv;
  if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }
  return "";
}

export function buildPublicPayUrl(payPath: string): string | null {
  const base = getCrmPayPageOrigin();
  if (!base) return null;
  const path = payPath.startsWith("/") ? payPath : `/${payPath}`;
  return `${base}${path}`;
}
