import type { OrderStage } from "@prisma/client";
import { fromUsd, normalizeCurrencyCode, toUsd } from "../common/currency.util";
import type { ExchangeRates } from "../settings/settings.service";
import type { OrderPaymentContext } from "../orders/order-payment-guards";
import { computeEffectiveTotal } from "../orders/order-payment-guards";

/**
 * How close `amount / exchangeRate` must land on the order total or debt
 * before a USD cash figure is treated as unconverted hryvnia.
 */
const HRYVNIA_AS_USD_TOLERANCE = 0.02;

const DEBT_CLOSED_STAGES = new Set<OrderStage>(["CANCELED", "REFUSED", "FULLY_RETURNED"]);

function fixedUsd(payment: {
  amountUsd?: number | null;
}): number | null {
  if (payment.amountUsd == null) return null;
  const n = Number(payment.amountUsd);
  return Number.isFinite(n) ? n : null;
}

/**
 * Payment contribution in the order's currency.
 * USD orders count only a dollar that is already fixed: `amountUsd`, or the
 * face amount when the payment itself is USD. A hryvnia row with an empty
 * `amountUsd` adds nothing — it is not revalued at the current settings rate.
 * Other order currencies use the face amount when currencies match, otherwise
 * the frozen dollar converted into the order currency.
 */
export function paymentAmountInOrderCurrency(
  payment: { amount: number; currency?: string | null; amountUsd?: number | null },
  orderCurrency: string | null | undefined,
  rates: ExchangeRates,
): number {
  const orderCur = normalizeCurrencyCode(orderCurrency);
  const payCur = normalizeCurrencyCode(payment.currency);
  const amount = Number(payment.amount);
  if (!Number.isFinite(amount)) return 0;
  const usd = fixedUsd(payment);
  if (orderCur === "USD") {
    if (usd != null) return usd;
    if (payCur === "USD") return amount;
    return 0;
  }
  if (payCur === orderCur) return amount;
  if (usd == null) return 0;
  return fromUsd(usd, orderCur, rates);
}

/**
 * Dollar snapshot stored on the payment.
 * UAH paid onto a USD order is divided once by that order's exchange rate
 * (hryvnia per 1 USD). Returns null when that rate is missing — the raw
 * hryvnia must not be stored as dollars and must not use the settings rate.
 * USD is already dollars. Any other pair keeps the settings-rate snapshot.
 */
export function fixedAmountUsd(input: {
  amount: number;
  paymentCurrency: string | null | undefined;
  orderCurrency: string | null | undefined;
  exchangeRate?: number | null;
  rates?: ExchangeRates;
}): number | null {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount)) return 0;
  const pay = normalizeCurrencyCode(input.paymentCurrency);
  const orderCur = normalizeCurrencyCode(input.orderCurrency);
  const rate = Number(input.exchangeRate);
  if (pay === "UAH" && orderCur === "USD") {
    if (!(rate > 1)) return null;
    return roundMoney(amount / rate);
  }
  if (pay === "USD") return roundMoney(amount);
  if (!input.rates) return null;
  return roundMoney(toUsd(amount, pay, input.rates));
}

/**
 * True when a USD amount is the order's hryvnia total or debt typed in as dollars
 * (for example 40 040 at rate 45 on an order of about $889.78).
 */
export function isHryvniaPostedAsUsd(input: {
  amount: number;
  paymentCurrency: string | null | undefined;
  orderCurrency: string | null | undefined;
  exchangeRate?: number | null;
  targetsUsd: Array<number | null | undefined>;
}): boolean {
  if (normalizeCurrencyCode(input.paymentCurrency) !== "USD") return false;
  if (normalizeCurrencyCode(input.orderCurrency) !== "USD") return false;
  const rate = Number(input.exchangeRate);
  const amount = Number(input.amount);
  if (!(rate > 1) || !Number.isFinite(amount) || amount <= 0) return false;
  const asUsd = amount / rate;
  for (const raw of input.targetsUsd) {
    const target = Number(raw);
    if (!(target > 0) || !Number.isFinite(target)) continue;
    if (amount <= target * 1.5) continue;
    if (Math.abs(asUsd - target) / target <= HRYVNIA_AS_USD_TOLERANCE) return true;
  }
  return false;
}

/** Debt / credit snapshot from paid vs effective total (after returns + FX write-off). */
export function computeOrderDebtAndCredit(ctx: {
  totalAmount?: number | null;
  returnAdjustmentAmount?: number | null;
  paidAmount?: number | null;
  fxWriteOffAmount?: number | null;
  orderStage?: OrderStage | null;
}): { effectiveTotal: number; debtAmount: number; creditAmount: number } {
  const paid = Number(ctx.paidAmount ?? 0);
  if (ctx.orderStage && DEBT_CLOSED_STAGES.has(ctx.orderStage)) {
    return { effectiveTotal: 0, debtAmount: 0, creditAmount: paid };
  }
  const effectiveTotal = computeEffectiveTotal(ctx as OrderPaymentContext);
  const fxWriteOff = Math.max(0, Number(ctx.fxWriteOffAmount ?? 0));
  const creditAmount = Math.max(0, paid - effectiveTotal);
  const debtAmount = Math.max(0, effectiveTotal - paid - fxWriteOff);
  return { effectiveTotal, debtAmount, creditAmount };
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}
