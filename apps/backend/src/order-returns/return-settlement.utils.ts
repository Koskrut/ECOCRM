import { computeOrderOverpayment } from "../client-balances/balance-holder.utils";
import { computeReturnAdjustmentAmount } from "./order-return-adjustment.utils";

export type ReturnItemForSettlement = {
  qtyReturned: number;
  orderItem: { qty: number; lineTotal: number };
};

export type ClosedReturnForSettlement = {
  id: string;
  settledAt: Date | null;
  items: ReturnItemForSettlement[];
};

export type OrderForReturnSettlement = {
  subtotalAmount: number;
  totalAmount: number;
  paidAmount: number;
};

const SETTLE_EPSILON = 0.009;

export function computeReturnMaxSettlement(
  ret: ClosedReturnForSettlement,
  order: OrderForReturnSettlement,
  otherClosedReturns: ClosedReturnForSettlement[],
): number {
  const allClosedIncludingThis = [...otherClosedReturns, { items: ret.items }];
  const adjustmentAfter = computeReturnAdjustmentAmount(allClosedIncludingThis, {
    subtotalAmount: order.subtotalAmount,
    totalAmount: order.totalAmount,
  });
  const thisReturnAmount = computeReturnAdjustmentAmount([{ items: ret.items }], {
    subtotalAmount: order.subtotalAmount,
    totalAmount: order.totalAmount,
  });
  const overpaymentAfter = computeOrderOverpayment({
    totalAmount: order.totalAmount,
    returnAdjustmentAmount: adjustmentAfter,
    paidAmount: order.paidAmount,
  });
  return Math.round(Math.min(thisReturnAmount, overpaymentAfter) * 100) / 100;
}

export function closedReturnNeedsSettlement(
  ret: ClosedReturnForSettlement,
  order: OrderForReturnSettlement,
  allClosedReturns: ClosedReturnForSettlement[],
): boolean {
  if (ret.settledAt) return false;
  const others = allClosedReturns.filter((r) => r.id !== ret.id);
  return computeReturnMaxSettlement(ret, order, others) > SETTLE_EPSILON;
}

export function findUnsettledClosedReturns(
  closedReturns: ClosedReturnForSettlement[],
  order: OrderForReturnSettlement,
): ClosedReturnForSettlement[] {
  return closedReturns.filter((ret) => closedReturnNeedsSettlement(ret, order, closedReturns));
}
