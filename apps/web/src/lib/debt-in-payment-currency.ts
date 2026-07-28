import { orderCurrencySymbol } from "@/lib/base-currency";

/**
 * Convert order debt into payment/transaction currency (same rules as backend
 * `expectedPaymentAmountInCurrency`).
 */
export function debtInPaymentCurrency(
  debtAmount: number,
  orderCurrency: string | undefined,
  paymentCurrency: string,
  exchangeRate?: number | null,
): number | null {
  if (!(debtAmount > 0)) return null;
  const orderCur = String(orderCurrency ?? "USD").toUpperCase();
  const payCur = String(paymentCurrency || "UAH").toUpperCase();
  const rate = Number(exchangeRate ?? 0);

  if (payCur === orderCur) return debtAmount;
  if (payCur === "UAH" && (orderCur === "USD" || orderCur === "EUR") && rate > 0) {
    return debtAmount * rate;
  }
  if (payCur === "USD" && orderCur === "UAH" && rate > 0) {
    return debtAmount / rate;
  }
  if (payCur === "EUR" && orderCur === "UAH" && rate > 0) {
    return debtAmount / rate;
  }
  return null;
}

/** Format order debt for allocate/distribute lists: payment currency first. */
export function formatDebtForAllocation(
  order: {
    debtAmount?: number;
    totalAmount?: number;
    currency?: string;
    exchangeRate?: number | null;
  },
  paymentCurrency: string,
): string {
  const debt = Number(order.debtAmount ?? 0);
  const amount = debt > 0 ? debt : Number(order.totalAmount ?? 0);
  if (!(amount > 0)) return "";

  const orderCur = String(order.currency ?? "USD").toUpperCase();
  const payCur = String(paymentCurrency || "UAH").toUpperCase();
  const orderSym = orderCurrencySymbol(orderCur);
  const paySym = orderCurrencySymbol(payCur);
  const converted = debtInPaymentCurrency(
    amount,
    orderCur,
    payCur,
    order.exchangeRate,
  );

  if (converted != null && orderCur !== payCur) {
    return `${converted.toFixed(2)} ${paySym} (${amount.toFixed(2)} ${orderSym})`;
  }
  if (converted != null) {
    return `${converted.toFixed(2)} ${paySym}`;
  }
  return `${amount.toFixed(2)} ${orderSym}`;
}

export function suggestedAllocationAmount(
  order: {
    debtAmount?: number;
    currency?: string;
    exchangeRate?: number | null;
  },
  paymentCurrency: string,
): string {
  const debt = Number(order.debtAmount ?? 0);
  if (!(debt > 0)) return "";
  const converted = debtInPaymentCurrency(
    debt,
    order.currency,
    paymentCurrency,
    order.exchangeRate,
  );
  return converted != null && converted > 0 ? converted.toFixed(2) : "";
}
