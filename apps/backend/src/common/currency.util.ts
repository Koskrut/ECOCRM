import type { BaseCurrency, ExchangeRates } from "../settings/settings.service";

export function normalizeCurrencyCode(currency: string | null | undefined): string {
  return (currency || "USD").trim().toUpperCase();
}

export function getBaseCurrency(rates: Pick<ExchangeRates, "baseCurrency">): BaseCurrency {
  return rates.baseCurrency === "EUR" ? "EUR" : "USD";
}

export function toUsd(amount: number, currency: string | null | undefined, rates: ExchangeRates): number {
  const c = normalizeCurrencyCode(currency);
  if (c === "USD") return amount;
  if (c === "UAH") return amount * (rates.UAH_TO_USD || 0);
  if (c === "EUR") return amount * (rates.EUR_TO_USD || 0);
  return amount;
}

export function usdToBase(usd: number, rates: ExchangeRates): number {
  const base = getBaseCurrency(rates);
  if (base === "EUR") {
    const eurToUsd = rates.EUR_TO_USD || 1;
    return eurToUsd > 0 ? usd / eurToUsd : usd;
  }
  return usd;
}

export function toBaseCurrency(
  amount: number,
  currency: string | null | undefined,
  rates: ExchangeRates,
): number {
  return usdToBase(toUsd(amount, currency, rates), rates);
}

export function paymentToBase(
  amountUsd: unknown,
  amount: unknown,
  currency: string | null | undefined,
  rates: ExchangeRates,
): number {
  if (amountUsd != null && amountUsd !== undefined) {
    const n = Number(amountUsd);
    if (Number.isFinite(n)) return Math.round(usdToBase(n, rates) * 100) / 100;
  }
  const amt = Number(amount ?? 0);
  if (!Number.isFinite(amt)) return 0;
  return Math.round(toBaseCurrency(amt, currency, rates) * 100) / 100;
}

/** UAH per 1 unit of order currency (USD or EUR). */
export function computeOrderExchangeRate(
  currency: string,
  rates: ExchangeRates,
): number | null {
  const c = normalizeCurrencyCode(currency);
  const uahPerUsd = rates.UAH_TO_USD > 0 ? 1 / rates.UAH_TO_USD : 41;
  if (c === "USD") return uahPerUsd;
  if (c === "EUR") return uahPerUsd * (rates.EUR_TO_USD || 1);
  return null;
}

export function normalizeBaseCurrency(value: unknown): BaseCurrency {
  return value === "EUR" ? "EUR" : "USD";
}
