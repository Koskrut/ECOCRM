/** Store promo: $60 off for every full $460 of merchandise (USD, before the discount). */
export const STORE_SPEND_TIER_USD = 460;
export const STORE_SPEND_DISCOUNT_USD = 60;

export type StoreSpendPromo = {
  thresholdUsd: number;
  discountPerStepUsd: number;
  steps: number;
};

export type StoreSpendPricing = {
  subtotalUsd: number;
  discountUsd: number;
  totalUsd: number;
  promo: StoreSpendPromo;
};

function roundMoney(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Unit price and line total the order will bill, in USD cents. */
export function storeCartLineUsd(price: number, qty: number): { price: number; lineTotal: number } {
  const unit = roundMoney(price);
  const q = Math.max(0, Math.trunc(Number(qty) || 0));
  return { price: unit, lineTotal: roundMoney(unit * q) };
}

/** Merchandise the order will actually bill. */
export function storeCartMerchandiseUsd(items: Array<{ price: number; qty: number }>): number {
  const sum = items.reduce((total, item) => total + storeCartLineUsd(item.price, item.qty).lineTotal, 0);
  return roundMoney(Math.max(0, sum));
}

export function storeSpendPromoForSubtotal(subtotalUsd: number): StoreSpendPricing {
  const subtotal = roundMoney(Math.max(0, Number(subtotalUsd) || 0));
  const steps = Math.floor(subtotal / STORE_SPEND_TIER_USD);
  const discountUsd = Math.min(subtotal, steps * STORE_SPEND_DISCOUNT_USD);
  return {
    subtotalUsd: subtotal,
    discountUsd,
    totalUsd: roundMoney(subtotal - discountUsd),
    promo: {
      thresholdUsd: STORE_SPEND_TIER_USD,
      discountPerStepUsd: STORE_SPEND_DISCOUNT_USD,
      steps,
    },
  };
}

/** Cart / bot total block. Without a discount this stays a single "Разом" line. */
export function formatStoreSpendPromoLines(input: {
  subtotalUsd: number;
  discountUsd: number;
  totalUsd: number;
  uahPerUsd: number;
  thresholdUsd?: number;
  discountPerStepUsd?: number;
}): string {
  const rate = input.uahPerUsd > 0 ? input.uahPerUsd : 0;
  const subtotalUah = Math.round(input.subtotalUsd * rate);
  const totalUah = Math.round(input.totalUsd * rate);
  if (!(input.discountUsd > 0) || totalUah >= subtotalUah) {
    return `Разом: ${totalUah} грн`;
  }
  const step = input.discountPerStepUsd ?? STORE_SPEND_DISCOUNT_USD;
  const tier = input.thresholdUsd ?? STORE_SPEND_TIER_USD;
  const discountUah = subtotalUah - totalUah;
  return `Товари: ${subtotalUah} грн\nЗнижка −${step} $ за кожні ${tier} $: −${discountUah} грн\nДо сплати: ${totalUah} грн`;
}
