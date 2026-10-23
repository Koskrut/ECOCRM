import type { ExchangeRates } from "../settings/settings.service";
import { normalizeCurrencyCode, toBaseCurrency } from "../common/currency.util";

export function canConvertCurrency(currency: string, rates: ExchangeRates): boolean {
  const code = normalizeCurrencyCode(currency);
  if (code === "USD") return true;
  if (code === "UAH") return rates.UAH_TO_USD > 0;
  if (code === "EUR") return (rates.EUR_TO_USD ?? 0) > 0;
  return false;
}

export function toBaseOrNull(amount: number, currency: string, rates: ExchangeRates): number | null {
  if (!canConvertCurrency(currency, rates)) return null;
  const value = toBaseCurrency(amount, currency, rates);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}
