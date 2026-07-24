export type BaseCurrency = "USD" | "EUR";

/** Order currencies that store UAH per unit in exchangeRate and use UAH for payment links. */
export function isForeignOrderCurrency(currency: string): boolean {
  const c = currency.trim().toUpperCase();
  return c === "USD" || c === "EUR";
}

export function orderCurrencySymbol(currency: string): string {
  const c = currency.trim().toUpperCase();
  if (c === "USD") return "$";
  if (c === "EUR") return "€";
  if (c === "UAH") return "₴";
  return c;
}

export function normalizeBaseCurrency(currency: string | null | undefined): BaseCurrency {
  return currency?.trim().toUpperCase() === "EUR" ? "EUR" : "USD";
}

/** Format catalog / draft amounts in base currency (USD/EUR). */
export function formatBaseMoney(amount: number, currency: string): string {
  return `${Number(amount).toFixed(2)} ${orderCurrencySymbol(currency)}`;
}

/**
 * Format order amount: main figure in order currency, optionally UAH (₴) in parentheses
 * when order is in USD/EUR and exchangeRate (UAH per 1 unit) is set.
 */
export function formatOrderAmount(
  amount: number,
  currency: string,
  exchangeRate?: number | null,
): string {
  const cur = (currency || "USD").trim().toUpperCase();
  const main = `${Number(amount).toFixed(2)} ${orderCurrencySymbol(cur)}`;
  if (isForeignOrderCurrency(cur) && exchangeRate != null && exchangeRate > 0) {
    return `${main} (${Math.round(amount * exchangeRate)} ₴)`;
  }
  return main;
}
