import type { Cart } from "@/lib/api";

const DEFAULT_TIER_USD = 460;
const DEFAULT_STEP_USD = 60;

export function CartTotals({ cart }: { cart: Cart }) {
  const rate = cart.uahPerUsd || 41;
  const subtotalUsd = cart.subtotal;
  const payableUsd = cart.total ?? cart.subtotal;
  const subtotalUah = Math.round(subtotalUsd * rate);
  const totalUah = Math.round(payableUsd * rate);
  const discountUah = Math.max(0, subtotalUah - totalUah);
  const threshold = cart.spendPromo?.thresholdUsd ?? DEFAULT_TIER_USD;
  const perStep = cart.spendPromo?.discountPerStepUsd ?? DEFAULT_STEP_USD;

  if (discountUah <= 0) {
    const remainUsd = Math.max(0, Math.round((threshold - subtotalUsd) * 100) / 100);
    return (
      <div>
        <p className="text-lg font-semibold text-zinc-900">Разом: {subtotalUah} грн</p>
        {subtotalUsd > 0 && remainUsd > 0 ? (
          <p className="mt-1 text-sm text-zinc-500">
            Акція: −{perStep} $ за кожні {threshold} $. До знижки ще {remainUsd} $.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-zinc-600">Товари: {subtotalUah} грн</p>
      <p className="mt-1 text-sm font-medium text-emerald-700">
        Знижка −{perStep} $ за кожні {threshold} $
        {cart.spendPromo && cart.spendPromo.steps > 1 ? ` × ${cart.spendPromo.steps}` : ""}: −{discountUah} грн
      </p>
      <p className="mt-1 text-lg font-semibold text-zinc-900">До сплати: {totalUah} грн</p>
    </div>
  );
}
