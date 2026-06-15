/**
 * Format order amount: main figure in order currency, optionally UAH (₴) in parentheses
 * when order is in USD/EUR and exchangeRate (UAH per 1 unit) is set.
 */
export function formatOrderAmount(
  amount: number,
  currency: string,
  exchangeRate?: number | null
): string {
  const cur = currency.trim().toUpperCase();
  const sym = cur === "USD" ? "$" : cur === "EUR" ? "€" : cur === "UAH" ? "₴" : currency;
  const main = `${Number(amount).toFixed(2)} ${sym}`;
  if ((cur === "USD" || cur === "EUR") && exchangeRate != null && exchangeRate > 0) {
    const uah = amount * exchangeRate;
    return `${main} (${Math.round(uah)} ₴)`;
  }
  return main;
}
