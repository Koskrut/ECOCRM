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

export function computeLineTotal(
  qty: number,
  price: number,
  discountPercent = 0,
  promoType: OrderPromoType | null = null,
): number {
  const safeQty = Math.max(1, Math.trunc(qty));
  const promo = promoType && isPromoApplicable(promoType, safeQty) ? promoType : null;
  if (promo === ORDER_PROMO_BUY_100_GET_30) {
    return price * safeQty * BUY_100_GET_30_PAID_RATIO;
  }
  if (promo === ORDER_PROMO_QTY_25_MINUS_2) {
    return safeQty * Math.max(0, price - QTY_25_MINUS_2_UNIT_OFF);
  }
  const gross = safeQty * price;
  const pct = Math.max(0, Math.min(100, Math.trunc(discountPercent)));
  return gross * (1 - pct / 100);
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}
