import type { ReturnReason } from "@prisma/client";
import { countsTowardOrderReturnAdjustment } from "../order-returns/order-return-mis-pick.utils";

/** Return that may reduce issued invoice / waybill lines. Same rule as order debt. */
export type DocumentReturn = {
  status: string;
  reason: ReturnReason;
  outboundWaivedAt: Date | null;
  items: Array<{ orderItemId: string; qtyReturned: number }>;
};

export function returnedQtyByOrderItem(
  returns: readonly DocumentReturn[] | null | undefined,
): Map<string, number> {
  const map = new Map<string, number>();
  if (!returns?.length) return map;
  for (const ret of returns) {
    if (!countsTowardOrderReturnAdjustment(ret)) continue;
    for (const item of ret.items) {
      const qty = Math.max(0, Number(item.qtyReturned) || 0);
      if (qty <= 0 || !item.orderItemId) continue;
      map.set(item.orderItemId, (map.get(item.orderItemId) ?? 0) + qty);
    }
  }
  return map;
}

export function netDocumentLine<T extends { id?: string; qty: number; lineTotal?: number | null }>(
  item: T,
  qtyReturned: number,
): T | null {
  const qty = Math.max(0, Number(item.qty) || 0);
  const returned = Math.min(qty, Math.max(0, Number(qtyReturned) || 0));
  const remaining = qty - returned;
  if (remaining <= 0) return null;
  if (returned <= 0) return item;
  const raw = item.lineTotal;
  const lineTotal =
    raw != null && Number.isFinite(Number(raw)) && qty > 0
      ? (Number(raw) * remaining) / qty
      : item.lineTotal;
  return { ...item, qty: remaining, lineTotal };
}

export function netDocumentLines<T extends { id?: string; qty: number; lineTotal?: number | null }>(
  items: readonly T[],
  returns: readonly DocumentReturn[] | null | undefined,
): T[] {
  const returned = returnedQtyByOrderItem(returns);
  const out: T[] = [];
  for (const item of items) {
    const qtyReturned = item.id ? (returned.get(item.id) ?? 0) : 0;
    const next = netDocumentLine(item, qtyReturned);
    if (next) out.push(next);
  }
  return out;
}

/** Amount printed on the invoice / waybill: order total after the return correction. */
export function documentTotalAfterReturns(order: {
  totalAmount?: number | null;
  returnAdjustmentAmount?: number | null;
}): number {
  const total = Math.max(0, Number(order.totalAmount) || 0);
  const adjustment = Math.max(0, Number(order.returnAdjustmentAmount) || 0);
  return Math.max(0, total - adjustment);
}

/**
 * Invoice and waybill view of an order.
 * Lines drop returned qty (only returns that already reduced the order).
 * Total is totalAmount − returnAdjustmentAmount.
 * Safe to call twice: the result has no remaining adjustment.
 */
export function applyReturnsToIssuedOrder<
  T extends {
    items: Array<{ id?: string; qty: number; lineTotal?: number | null }>;
    totalAmount: number;
    returnAdjustmentAmount?: number | null;
    returns?: readonly DocumentReturn[] | null;
  },
>(order: T): T {
  const adjustment = Math.max(0, Number(order.returnAdjustmentAmount) || 0);
  if (!order.returns?.length && adjustment <= 0) return order;
  return {
    ...order,
    items: netDocumentLines(order.items, order.returns),
    totalAmount: documentTotalAfterReturns(order),
    returnAdjustmentAmount: 0,
    returns: [],
  };
}
