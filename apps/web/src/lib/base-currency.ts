export type BaseCurrency = "USD" | "EUR";

export function formatBaseMoney(amount: number, currency: BaseCurrency | string): string {
  const code = currency === "EUR" ? "EUR" : "USD";
  const sym = code === "EUR" ? "€" : "$";
  return `${Number(amount).toFixed(2)} ${sym}`;
}

export function baseCurrencyLabel(currency: BaseCurrency | string): string {
  return currency === "EUR" ? "EUR" : "USD";
}

export function baseCurrencySymbol(currency: BaseCurrency | string): string {
  return currency === "EUR" ? "€" : "$";
}

export function orderCurrencySymbol(currency: string): string {
  const c = currency.trim().toUpperCase();
  if (c === "USD") return "$";
  if (c === "EUR") return "€";
  if (c === "UAH") return "₴";
  return c;
}

/** Order currencies that store UAH per unit in exchangeRate and use UAH for payment links. */
export function isForeignOrderCurrency(currency: string): boolean {
  const c = currency.trim().toUpperCase();
  return c === "USD" || c === "EUR";
}
