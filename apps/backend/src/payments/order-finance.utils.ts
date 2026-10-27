import type { OrderStage } from "@prisma/client";
import { fromUsd, normalizeCurrencyCode, toUsd } from "../common/currency.util";
import type { ExchangeRates } from "../settings/settings.service";
import type { OrderPaymentContext } from "../orders/order-payment-guards";
import { computeEffectiveTotal } from "../orders/order-payment-guards";

/**
 * Payment contribution in the order's currency.
 * USD orders keep the previous rule (frozen amountUsd, else live conversion),
 * so historical USD debt does not move. Other order currencies use the face
 * amount when the payment is already in that currency, otherwise the frozen
 * USD equivalent converted into the order currency.
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
  const usd =
    payment.amountUsd != null && Number.isFinite(Number(payment.amountUsd))
      ? Number(payment.amountUsd)
      : toUsd(amount, payCur, rates);
  if (orderCur === "USD") return usd;
  if (payCur === orderCur) return amount;
  return fromUsd(usd, orderCur, rates);
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
  if (ctx.orderStage === "CANCELED") {
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
