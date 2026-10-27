/**
 * Helpers for receivables "full client debt" payment links.
 * Order.debtAmount is in the order currency. exchangeRate is UAH per 1 unit of that currency.
 */

export type DebtOrderForPayLink = {
  id: string;
  debtAmount: number;
  exchangeRate: number | null | undefined;
  paymentDueDate: Date | null | undefined;
  bankAccountId: string | null | undefined;
  orderNumber?: string | null;
};

/** `asOf` should be start-of-day (e.g. Kyiv) so due-today is not overdue — same as work clients. */
function isOverdue(
  paymentDueDate: Date | null | undefined,
  debtAmount: number,
  asOfStartOfDay: Date,
): boolean {
  if (!(debtAmount > 0) || !paymentDueDate) return false;
  return paymentDueDate < asOfStartOfDay;
}

/** Pick primary debt order: prefer overdue, then highest debt (same idea as work clients). */
export function pickPrimaryDebtOrder<T extends DebtOrderForPayLink>(
  orders: T[],
  asOfStartOfDay: Date = new Date(),
): T | null {
  let best: T | null = null;
  let bestOverdue = false;
  let bestDebt = 0;
  for (const o of orders) {
    const debt = Number(o.debtAmount);
    if (!(debt > 0)) continue;
    const overdue = isOverdue(o.paymentDueDate, debt, asOfStartOfDay);
    if (
      !best ||
      (overdue && !bestOverdue) ||
      (overdue === bestOverdue && debt > bestDebt)
    ) {
      best = o;
      bestOverdue = overdue;
      bestDebt = debt;
    }
  }
  return best;
}

/**
 * Anchor order for the payment request: primary if it has a bank account,
 * otherwise any debt order with a bank account (prefer overdue / higher debt).
 */
export function pickPayLinkAnchorOrder<T extends DebtOrderForPayLink>(
  orders: T[],
  asOfStartOfDay: Date = new Date(),
): T | null {
  const primary = pickPrimaryDebtOrder(orders, asOfStartOfDay);
  if (primary?.bankAccountId) return primary;
  const withBank = orders.filter((o) => Number(o.debtAmount) > 0 && o.bankAccountId);
  return pickPrimaryDebtOrder(withBank, asOfStartOfDay);
}

/** Sum of order-currency debts converted to UAH. A missing rate falls back to UAH per 1 USD. */
export function computeFullDebtPayAmountUah(
  orders: Array<Pick<DebtOrderForPayLink, "debtAmount" | "exchangeRate">>,
  fallbackUahPerUsd: number,
): number {
  let total = 0;
  for (const o of orders) {
    const debt = Number(o.debtAmount);
    if (!(debt > 0)) continue;
    const rate =
      o.exchangeRate != null && Number(o.exchangeRate) > 0
        ? Number(o.exchangeRate)
        : fallbackUahPerUsd;
    if (!(rate > 0)) continue;
    total += debt * rate;
  }
  return Math.round(total * 100) / 100;
}

export function amountsMatchForReuse(a: number, b: number, absTol = 0.02): boolean {
  return Math.abs(a - b) <= absTol;
}

/** Purpose text for NBU / public pay page (max 140 chars in DTO). */
export function buildFullDebtPayPurpose(params: {
  anchorOrderNumber: string;
  debtOrderCount: number;
}): string {
  const n = params.debtOrderCount;
  const num = params.anchorOrderNumber.trim() || "?";
  if (n <= 1) return `Оплата боргу. Замовлення ${num}`.slice(0, 140);
  return `Оплата боргу (${n} зам.). Осн. ${num}`.slice(0, 140);
}
