/**
 * Format order amount: main figure in order currency (USD $), optionally UAH (₴) in parentheses
 * when order is in USD and exchangeRate (UAH per 1 USD) is set.
 */
export function formatOrderAmount(
  amount: number,
  currency: string,
  exchangeRate?: number | null
): string {
  const sym = currency === "USD" ? "$" : currency === "UAH" ? "₴" : currency;
  const main = `${Number(amount).toFixed(2)} ${sym}`;
  if (currency === "USD" && exchangeRate != null && exchangeRate > 0) {
    const uah = amount * exchangeRate;
    return `${main} (${Math.round(uah)} ₴)`;
  }
  return main;
}
