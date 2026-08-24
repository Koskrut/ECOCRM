export const ORDER_PROMO_BUY_100_GET_30 = "BUY_100_GET_30" as const;
export const ORDER_PROMO_QTY_25_MINUS_2 = "QTY_25_MINUS_2" as const;

export const ORDER_PROMO_TYPES = [
  ORDER_PROMO_BUY_100_GET_30,
  ORDER_PROMO_QTY_25_MINUS_2,
] as const;

export type OrderPromoType = (typeof ORDER_PROMO_TYPES)[number];

export const BUY_100_GET_30_MIN_QTY = 130;
export const BUY_100_GET_30_PAID_RATIO = 100 / 130;
export const QTY_25_MINUS_2_MIN_QTY = 25;
export const QTY_25_MINUS_2_UNIT_OFF = 2;

export function isOrderPromoType(value: unknown): value is OrderPromoType {
  return value === ORDER_PROMO_BUY_100_GET_30 || value === ORDER_PROMO_QTY_25_MINUS_2;
}

export function parsePromoType(raw: unknown): OrderPromoType | null {
  if (raw === undefined || raw === null || raw === "" || raw === "NONE") return null;
  if (isOrderPromoType(raw)) return raw;
  return null;
}

export function isPromoApplicable(promoType: OrderPromoType, qty: number): boolean {
  if (promoType === ORDER_PROMO_BUY_100_GET_30) return qty >= BUY_100_GET_30_MIN_QTY;
  if (promoType === ORDER_PROMO_QTY_25_MINUS_2) return qty >= QTY_25_MINUS_2_MIN_QTY;
  return false;
}

export function computeLineTotal(qty: number, price: number, discountPercent = 0): number {
  const gross = qty * price;
  const pct = Math.max(0, Math.min(100, Math.trunc(discountPercent)));
  return gross * (1 - pct / 100);
}

export function computeLinePricing(
  qty: number,
  price: number,
  discountPercent = 0,
  promoType: OrderPromoType | null = null,
): { discountPercent: number; promoType: OrderPromoType | null; lineTotal: number; effectiveUnitPrice: number } {
  const safeQty = Math.max(1, Math.trunc(qty));
  const pct = Math.max(0, Math.min(100, Math.trunc(discountPercent)));
  const promo = promoType && isPromoApplicable(promoType, safeQty) ? promoType : null;

  if (promo === ORDER_PROMO_BUY_100_GET_30) {
    const lineTotal = price * safeQty * BUY_100_GET_30_PAID_RATIO;
    return {
      discountPercent: 0,
      promoType: promo,
      lineTotal,
      effectiveUnitPrice: lineTotal / safeQty,
    };
  }
  if (promo === ORDER_PROMO_QTY_25_MINUS_2) {
    const unit = Math.max(0, price - QTY_25_MINUS_2_UNIT_OFF);
    const lineTotal = safeQty * unit;
    return {
      discountPercent: 0,
      promoType: promo,
      lineTotal,
      effectiveUnitPrice: unit,
    };
  }

  const lineTotal = computeLineTotal(safeQty, price, pct);
  return {
    discountPercent: pct,
    promoType: null,
    lineTotal,
    effectiveUnitPrice: lineTotal / safeQty,
  };
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
