export function formatMoney(amount: number, currency: string) {
  const sym = currency === "EUR" ? "€" : "$";
  return `${amount.toFixed(2)} ${sym}`;
}
