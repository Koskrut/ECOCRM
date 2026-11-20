/**
 * Unit price for 1C sheet and printed documents.
 * Catalog `price` stays the list price in the order. When a line discount or promo
 * reduced `lineTotal`, the exported unit is `lineTotal / qty` so price matches the sum.
 */
export function exportUnitPrice(item: {
  qty: number;
  price: number;
  lineTotal?: number | null;
}): number {
  const price = Number(item.price) || 0;
  const qty = Number(item.qty) || 0;
  if (!(qty > 0) || item.lineTotal == null || !Number.isFinite(Number(item.lineTotal))) {
    return price;
  }
  const lineTotal = Number(item.lineTotal);
  const gross = qty * price;
  if (Math.abs(lineTotal - gross) < 0.000001) return price;
  return lineTotal / qty;
}

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

/** Builtin ids and any admin-created promo id stored on an order line. */
export type OrderPromoType = string;

export const BUY_100_GET_30_MIN_QTY = 130;
export const BUY_100_GET_30_PAID_RATIO = 100 / 130;
export const QTY_25_MINUS_2_MIN_QTY = 25;
export const QTY_25_MINUS_2_UNIT_OFF = 2;

export const ORDER_PROMO_ID_RE = /^[A-Z][A-Z0-9_]{0,39}$/;

export type OrderPromoKind = "pay_ratio" | "unit_off";

/** Manager-selectable line promotion. `pay_ratio` groups lines with the same unit price. */
export type OrderPromoDefinition = {
  id: string;
  name: string;
  enabled: boolean;
  kind: OrderPromoKind;
  minQty: number;
  /** Units paid per bundle. Used when kind is pay_ratio. */
  payUnits: number;
  /** Bundle size (paid + free). Used when kind is pay_ratio. */
  bundleUnits: number;
  /** Amount taken off each unit. Used when kind is unit_off. */
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

export function isBuiltinPromoId(value: string): boolean {
  return value === ORDER_PROMO_BUY_100_GET_30 || value === ORDER_PROMO_QTY_25_MINUS_2;
}

export function isOrderPromoType(
  value: unknown,
  catalog?: readonly OrderPromoDefinition[] | null,
): value is string {
  if (typeof value !== "string" || !value) return false;
  if (isBuiltinPromoId(value)) return true;
  return !!catalog?.some((p) => p.id === value);
}

export function findPromoDefinition(
  id: string,
  catalog?: readonly OrderPromoDefinition[] | null,
): OrderPromoDefinition | null {
  const fromCatalog = catalog?.find((p) => p.id === id);
  if (fromCatalog) return fromCatalog;
  return defaultOrderPromoCatalog().find((p) => p.id === id) ?? null;
}

function readPromoInt(value: unknown, min: number, max: number): number | null {
  if (typeof value === "string" && value.trim() === "") return null;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

/** Validate one promotion from settings JSON. Throws Error with a user-facing message. */
export function parseOrderPromoDefinition(raw: unknown): OrderPromoDefinition {
  if (!raw || typeof raw !== "object") {
    throw new Error("Акція має бути обʼєктом");
  }
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!ORDER_PROMO_ID_RE.test(id)) {
    throw new Error("Некоректний ідентифікатор акції");
  }
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name || name.length > 80) {
    throw new Error("Вкажіть назву акції (до 80 символів)");
  }
  if (o.kind !== "pay_ratio" && o.kind !== "unit_off") {
    throw new Error("Некоректний тип акції");
  }
  const minQty = readPromoInt(o.minQty, 1, 100_000);
  if (minQty == null) {
    throw new Error("Мінімальна кількість має бути цілим числом від 1 до 100000");
  }
  if (o.kind === "pay_ratio") {
    const payUnits = readPromoInt(o.payUnits, 1, 100_000);
    if (payUnits == null) throw new Error("Вкажіть, скільки штук оплачується");
    const freeRaw = o.freeUnits;
    const freeUnits =
      freeRaw == null || freeRaw === "" ? null : readPromoInt(freeRaw, 1, 100_000);
    if (freeRaw != null && freeRaw !== "" && freeUnits == null) {
      throw new Error("Кількість у подарунок має бути цілим числом від 1");
    }
    const bundleUnits =
      freeUnits != null ? payUnits + freeUnits : readPromoInt(o.bundleUnits, payUnits + 1, 200_000);
    if (bundleUnits == null || bundleUnits <= payUnits) {
      throw new Error("Вкажіть, скільки штук у подарунок");
    }
    return {
      id,
      name,
      enabled: o.enabled !== false,
      kind: "pay_ratio",
      minQty,
      payUnits,
      bundleUnits,
      unitOff: 0,
    };
  }
  const off = typeof o.unitOff === "number" ? o.unitOff : Number(o.unitOff);
  if (!Number.isFinite(off) || off <= 0 || off > 1_000_000) {
    throw new Error("Знижка з ціни має бути більшою за 0");
  }
  return {
    id,
    name,
    enabled: o.enabled !== false,
    kind: "unit_off",
    minQty,
    payUnits: 0,
    bundleUnits: 0,
    unitOff: Math.round(off * 100) / 100,
  };
}

/** Parse promo from API/storage. Empty / NONE / null → no promo. Unknown → Error. */
export function parsePromoType(
  raw: unknown,
  catalog?: readonly OrderPromoDefinition[] | null,
): OrderPromoType | null {
  if (raw === undefined || raw === null || raw === "" || raw === "NONE") return null;
  if (typeof raw !== "string") throw new Error(`Unknown promoType: ${String(raw)}`);
  const id = raw.trim();
  if (isBuiltinPromoId(id)) return id;
  if (catalog?.some((p) => p.id === id)) return id;
  throw new Error(`Unknown promoType: ${id}`);
}

/** Compare catalog unit prices in cents (same-price promo groups). */
export function pricesMatch(a: number, b: number): boolean {
  return Math.round(Number(a) * 100) === Math.round(Number(b) * 100);
}

/** Sum qty of lines whose unit price matches `price` (rounded to cents). */
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

export function promoMinQty(
  promoType: OrderPromoType,
  catalog?: readonly OrderPromoDefinition[] | null,
): number {
  return findPromoDefinition(promoType, catalog)?.minQty ?? 0;
}

export function promoNotApplicableMessage(
  promoType: OrderPromoType,
  catalog?: readonly OrderPromoDefinition[] | null,
): string {
  const def = findPromoDefinition(promoType, catalog);
  if (!def) return `Unknown promoType: ${promoType}`;
  if (def.id === ORDER_PROMO_BUY_100_GET_30 && def.minQty === BUY_100_GET_30_MIN_QTY) {
    return `Акція «100+30» доступна від ${def.minQty} шт`;
  }
  if (def.id === ORDER_PROMO_QTY_25_MINUS_2 && def.minQty === QTY_25_MINUS_2_MIN_QTY) {
    return `Акція «−2$ від ${def.minQty} шт» доступна від ${def.minQty} шт`;
  }
  return `Акція «${def.name}» доступна від ${def.minQty} шт`;
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
 * @param options.dropInapplicable when true (e.g. split), clear inapplicable promo instead of throwing
 * @param options.eligibilityQty qty used for promo threshold (e.g. same-price group for pay-ratio promos)
 * @param options.catalog promotion definitions; builtins are used when the id is missing from the catalog
 */
export function computeLinePricing(
  qty: number,
  price: number,
  discountPercent = 0,
  promoType: OrderPromoType | null = null,
  options?: {
    dropInapplicable?: boolean;
    eligibilityQty?: number;
    catalog?: readonly OrderPromoDefinition[] | null;
  },
): LinePricingResult {
  const safeQty = Math.max(1, Math.trunc(qty));
  const pct = Math.max(0, Math.min(100, Math.trunc(discountPercent)));
  const checkQty =
    options?.eligibilityQty != null ? Math.max(0, Math.trunc(options.eligibilityQty)) : safeQty;

  const clearPromo = (): LinePricingResult => {
    const lineTotal = computeLineTotal(safeQty, price, pct);
    return {
      discountPercent: pct,
      promoType: null,
      lineTotal,
      effectiveUnitPrice: lineTotal / safeQty,
    };
  };

  if (promoType) {
    const def = findPromoDefinition(promoType, options?.catalog);
    if (!def) {
      if (options?.dropInapplicable) return clearPromo();
      throw new Error(`Unknown promoType: ${promoType}`);
    }
    if (checkQty < def.minQty) {
      if (options?.dropInapplicable) return clearPromo();
      throw new Error(promoNotApplicableMessage(promoType, options?.catalog));
    }

    if (def.kind === "pay_ratio") {
      if (!(def.bundleUnits > 0) || !(def.payUnits > 0)) {
        if (options?.dropInapplicable) return clearPromo();
        throw new Error(promoNotApplicableMessage(promoType, options?.catalog));
      }
      const lineTotal = price * safeQty * (def.payUnits / def.bundleUnits);
      return {
        discountPercent: 0,
        promoType,
        lineTotal,
        effectiveUnitPrice: lineTotal / safeQty,
      };
    }

    const unit = Math.max(0, price - def.unitOff);
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
