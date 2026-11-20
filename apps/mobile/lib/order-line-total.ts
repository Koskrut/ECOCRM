export const ORDER_PROMO_BUY_100_GET_30 = "BUY_100_GET_30" as const;
export const ORDER_PROMO_QTY_25_MINUS_2 = "QTY_25_MINUS_2" as const;

export const ORDER_PROMO_TYPES = [
  ORDER_PROMO_BUY_100_GET_30,
  ORDER_PROMO_QTY_25_MINUS_2,
] as const;

export type OrderPromoType = string;

export const BUY_100_GET_30_MIN_QTY = 130;
export const BUY_100_GET_30_PAID_RATIO = 100 / 130;
export const QTY_25_MINUS_2_MIN_QTY = 25;
export const QTY_25_MINUS_2_UNIT_OFF = 2;

export type OrderPromoKind = "pay_ratio" | "unit_off";

export type OrderPromoDefinition = {
  id: string;
  name: string;
  enabled: boolean;
  kind: OrderPromoKind;
  minQty: number;
  payUnits: number;
  bundleUnits: number;
  unitOff: number;
};

export function defaultOrderPromoCatalog(): OrderPromoDefinition[] {
  return [
    {
      id: ORDER_PROMO_BUY_100_GET_30,
      name: "100+30",
      enabled: true,
      kind: "pay_ratio",
      minQty: BUY_100_GET_30_MIN_QTY,
      payUnits: 100,
      bundleUnits: 130,
      unitOff: 0,
    },
    {
      id: ORDER_PROMO_QTY_25_MINUS_2,
      name: "−$2 від 25 шт",
      enabled: true,
      kind: "unit_off",
      minQty: QTY_25_MINUS_2_MIN_QTY,
      payUnits: 0,
      bundleUnits: 0,
      unitOff: QTY_25_MINUS_2_UNIT_OFF,
    },
  ];
}

export function catalogFromLegacyPromos(promos: readonly string[] | undefined): OrderPromoDefinition[] {
  if (!promos) return defaultOrderPromoCatalog();
  const enabled = new Set(promos);
  return defaultOrderPromoCatalog().map((promo) => ({
    ...promo,
    enabled: enabled.has(promo.id),
  }));
}

function isBuiltinPromoId(value: string): boolean {
  return value === ORDER_PROMO_BUY_100_GET_30 || value === ORDER_PROMO_QTY_25_MINUS_2;
}

export function isOrderPromoType(
  value: unknown,
  catalog?: readonly OrderPromoDefinition[] | null,
): value is string {
  if (typeof value !== "string" || !value) return false;
  if (isBuiltinPromoId(value)) return true;
  return !!catalog?.some((promo) => promo.id === value);
}

export function findPromoDefinition(
  id: string,
  catalog?: readonly OrderPromoDefinition[] | null,
): OrderPromoDefinition | null {
  const fromCatalog = catalog?.find((promo) => promo.id === id);
  if (fromCatalog) return fromCatalog;
  return defaultOrderPromoCatalog().find((promo) => promo.id === id) ?? null;
}

export function parsePromoType(
  raw: unknown,
  catalog?: readonly OrderPromoDefinition[] | null,
): OrderPromoType | null {
  if (raw === undefined || raw === null || raw === "" || raw === "NONE") return null;
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  if (isBuiltinPromoId(id)) return id;
  if (catalog?.some((promo) => promo.id === id)) return id;
  return null;
}

export function pricesMatch(a: number, b: number): boolean {
  return Math.round(Number(a) * 100) === Math.round(Number(b) * 100);
}

export function sumQtyForSamePrice(
  items: Array<{ qty: number; price: number }>,
  price: number,
): number {
  return items
    .filter((it) => pricesMatch(it.price, price))
    .reduce((s, it) => s + Math.max(0, Math.trunc(it.qty)), 0);
}

export function isPromoApplicable(
  promoType: OrderPromoType,
  qty: number,
  catalog?: readonly OrderPromoDefinition[] | null,
): boolean {
  const def = findPromoDefinition(promoType, catalog);
  if (!def) return false;
  return qty >= def.minQty;
}

export function promoEligibilityQty(
  promoType: OrderPromoType,
  line: { qty: number; price: number },
  items: Array<{ qty: number; price: number }>,
  catalog?: readonly OrderPromoDefinition[] | null,
): number {
  if (findPromoDefinition(promoType, catalog)?.kind === "pay_ratio") {
    return sumQtyForSamePrice(items, line.price);
  }
  return line.qty;
}

export function computeLineTotal(
  qty: number,
  price: number,
  discountPercent = 0,
  promoType: OrderPromoType | null = null,
  eligibilityQty?: number,
  catalog?: readonly OrderPromoDefinition[] | null,
): number {
  const safeQty = Math.max(1, Math.trunc(qty));
  const checkQty = eligibilityQty != null ? Math.max(0, Math.trunc(eligibilityQty)) : safeQty;
  const def = promoType ? findPromoDefinition(promoType, catalog) : null;
  const promo = def && checkQty >= def.minQty ? def : null;
  if (promo?.kind === "pay_ratio" && promo.bundleUnits > 0 && promo.payUnits > 0) {
    return price * safeQty * (promo.payUnits / promo.bundleUnits);
  }
  if (promo?.kind === "unit_off") {
    return safeQty * Math.max(0, price - promo.unitOff);
  }
  const gross = safeQty * price;
  const pct = Math.max(0, Math.min(100, Math.trunc(discountPercent)));
  return gross * (1 - pct / 100);
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}
