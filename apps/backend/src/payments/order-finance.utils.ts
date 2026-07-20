import type { OrderPaymentContext } from "../orders/order-payment-guards";
import { computeEffectiveTotal } from "../orders/order-payment-guards";

/** Debt / credit snapshot from paid vs effective total (after returns + FX write-off). */
export function computeOrderDebtAndCredit(ctx: {
  totalAmount?: number | null;
  returnAdjustmentAmount?: number | null;
  paidAmount?: number | null;
  fxWriteOffAmount?: number | null;
}): { effectiveTotal: number; debtAmount: number; creditAmount: number } {
  const effectiveTotal = computeEffectiveTotal(ctx as OrderPaymentContext);
  const paid = Number(ctx.paidAmount ?? 0);
  const fxWriteOff = Math.max(0, Number(ctx.fxWriteOffAmount ?? 0));
  const creditAmount = Math.max(0, paid - effectiveTotal);
  const debtAmount = Math.max(0, effectiveTotal - paid - fxWriteOff);
  return { effectiveTotal, debtAmount, creditAmount };
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}
