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

/** Parse promo from API/storage. Empty / NONE / null → no promo. Unknown → Error. */
export function parsePromoType(raw: unknown): OrderPromoType | null {
  if (raw === undefined || raw === null || raw === "" || raw === "NONE") return null;
  if (isOrderPromoType(raw)) return raw;
  throw new Error(`Unknown promoType: ${String(raw)}`);
}

export function isPromoApplicable(promoType: OrderPromoType, qty: number): boolean {
  if (promoType === ORDER_PROMO_BUY_100_GET_30) return qty >= BUY_100_GET_30_MIN_QTY;
  if (promoType === ORDER_PROMO_QTY_25_MINUS_2) return qty >= QTY_25_MINUS_2_MIN_QTY;
  return false;
}

export function promoMinQty(promoType: OrderPromoType): number {
  if (promoType === ORDER_PROMO_BUY_100_GET_30) return BUY_100_GET_30_MIN_QTY;
  return QTY_25_MINUS_2_MIN_QTY;
}

export function promoNotApplicableMessage(promoType: OrderPromoType): string {
  if (promoType === ORDER_PROMO_BUY_100_GET_30) {
    return `Акція «100+30» доступна від ${BUY_100_GET_30_MIN_QTY} шт`;
  }
  return `Акція «−2$ від ${QTY_25_MINUS_2_MIN_QTY} шт» доступна від ${QTY_25_MINUS_2_MIN_QTY} шт`;
}

export type LinePricingResult = {
  discountPercent: number;
  promoType: OrderPromoType | null;
  lineTotal: number;
  /** Unit price after promo (catalog `price` stays unchanged). */
  effectiveUnitPrice: number;
};

/**
 * Resolve line pricing. Promo and percent discount are mutually exclusive:
 * when a promo applies, percent is forced to 0.
 *
 * @param dropInapplicable when true (e.g. split), clear inapplicable promo instead of throwing
 */
export function computeLinePricing(
  qty: number,
  price: number,
  discountPercent = 0,
  promoType: OrderPromoType | null = null,
  options?: { dropInapplicable?: boolean },
): LinePricingResult {
  const safeQty = Math.max(1, Math.trunc(qty));
  const pct = Math.max(0, Math.min(100, Math.trunc(discountPercent)));

  if (promoType) {
    if (!isPromoApplicable(promoType, safeQty)) {
      if (options?.dropInapplicable) {
        const lineTotal = computeLineTotal(safeQty, price, pct);
        return {
          discountPercent: pct,
          promoType: null,
          lineTotal,
          effectiveUnitPrice: lineTotal / safeQty,
        };
      }
      throw new Error(promoNotApplicableMessage(promoType));
    }

    if (promoType === ORDER_PROMO_BUY_100_GET_30) {
      // Pay for 100 of every 130: effective unit = price * 100/130 (e.g. 16 → 1600/130)
      const lineTotal = price * safeQty * BUY_100_GET_30_PAID_RATIO;
      return {
        discountPercent: 0,
        promoType,
        lineTotal,
        effectiveUnitPrice: lineTotal / safeQty,
      };
    }

    const unit = Math.max(0, price - QTY_25_MINUS_2_UNIT_OFF);
    const lineTotal = safeQty * unit;
    return {
      discountPercent: 0,
      promoType,
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
