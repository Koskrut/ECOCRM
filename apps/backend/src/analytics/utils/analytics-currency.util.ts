import type { ExchangeRates } from "../../settings/settings.service";

export function toUsd(amount: number, currency: string | null | undefined, rates: ExchangeRates): number {
  const c = (currency || "USD").trim().toUpperCase();
  if (c === "USD") return amount;
  if (c === "UAH") return amount * (rates.UAH_TO_USD || 0);
  if (c === "EUR") return amount * (rates.EUR_TO_USD || 0);
  // Unknown currency: do not guess; treat as USD to avoid inflating numbers.
  return amount;
}

export function safeNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

