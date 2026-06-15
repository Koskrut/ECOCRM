export function computeLineTotal(qty: number, price: number, discountPercent = 0): number {
  const gross = qty * price;
  const pct = Math.max(0, Math.min(100, Math.trunc(discountPercent)));
  return gross * (1 - pct / 100);
}

export function computeOrderLineDiscountSum(
  items: Array<{ qty: number; price: number; discountPercent?: number; lineTotal: number }>,
): number {
  const gross = items.reduce((s, it) => s + it.qty * it.price, 0);
  const net = items.reduce((s, it) => s + it.lineTotal, 0);
  return Math.max(0, gross - net);
}

export function computeOrderGrossSubtotal(
  items: Array<{ qty: number; price: number }>,
): number {
  return items.reduce((s, it) => s + it.qty * it.price, 0);
}
