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
