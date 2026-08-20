export type ExchangeRates = {
  UAH_TO_USD: number;
  EUR_TO_USD?: number;
  UAH_TO_EUR?: number;
  baseCurrency?: "USD" | "EUR";
};

export function convertPaymentToUsd(
  amount: number,
  currency: string,
  rates: ExchangeRates,
): number {
  const c = (currency || "USD").trim().toUpperCase();
  if (c === "USD") return amount;
  if (c === "UAH") return amount * (rates.UAH_TO_USD || 0);
  if (c === "EUR") return amount * (rates.EUR_TO_USD || 0);
  return amount;
}

/** True when manual USD deviates from rate-based USD by more than toleranceFraction (default 1%). */
export function paymentUsdVarianceExceedsTolerance(
  amount: number,
  currency: string,
  amountUsd: number,
  rates: ExchangeRates,
  toleranceFraction = 0.01,
): boolean {
  const expected = convertPaymentToUsd(amount, currency, rates);
  if (!(expected > 0)) return false;
  return Math.abs(amountUsd - expected) / expected > toleranceFraction;
}
