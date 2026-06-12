type ClosedReturnItem = {
  qtyReturned: number;
  orderItem: { qty: number; lineTotal: number };
};

type ClosedReturn = {
  items: ClosedReturnItem[];
};

/** Net return adjustment after order-level discount (used for debt / effective total). */
export function computeReturnAdjustmentAmount(
  closedReturns: ClosedReturn[],
  order: { subtotalAmount: number; totalAmount: number },
): number {
  const subtotal = Math.max(0, Number(order.subtotalAmount ?? 0));
  const total = Math.max(0, Number(order.totalAmount ?? 0));
  const discountRatio = subtotal > 0 ? total / subtotal : 1;

  return closedReturns.reduce((sum, ret) => {
    return (
      sum +
      ret.items.reduce((s, ri) => {
        const qty = Math.max(1, ri.orderItem.qty);
        const lineReturnGross = (Number(ri.orderItem.lineTotal) / qty) * ri.qtyReturned;
        return s + lineReturnGross * discountRatio;
      }, 0)
    );
  }, 0);
}
