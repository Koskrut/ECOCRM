/** Gross line amount before discount. */
export function computeLineGross(qty: number, price: number): number {
  return qty * price;
}

/** Net line total after optional percent discount (0–100). */
export function computeLineTotal(qty: number, price: number, discountPercent = 0): number {
  const gross = computeLineGross(qty, price);
  const pct = Math.max(0, Math.min(100, Math.trunc(discountPercent)));
  return gross * (1 - pct / 100);
}
