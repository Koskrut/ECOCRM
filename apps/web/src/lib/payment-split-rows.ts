import { debtInPaymentCurrency } from "@/lib/debt-in-payment-currency";

export type SplitOrder = {
  id: string;
  orderNumber?: string;
  debtAmount?: number;
  currency?: string;
  exchangeRate?: number | null;
  paymentDueDate?: string | null;
  createdAt?: string;
};

export type SplitRow = { orderId: string; orderNumber: string; amount: string };

export function roundSplitMoney(n: number): number {
  return Math.round(n * 100 + (n >= 0 ? 1e-8 : -1e-8)) / 100;
}

/** Order debt in the payment currency. Debt is stored in the order currency. */
export function orderDebtInPaymentCurrency(order: SplitOrder, paymentCurrency: string): number {
  const debt = Number(order.debtAmount ?? 0);
  if (!(debt > 0)) return 0;
  const converted = debtInPaymentCurrency(
    debt,
    order.currency,
    paymentCurrency,
    order.exchangeRate,
  );
  if (converted == null || !(converted > 0)) return 0;
  return roundSplitMoney(converted);
}

function allocateAmounts(debts: number[], totalAmount: number): number[] {
  const target = roundSplitMoney(totalAmount);
  if (debts.length === 0 || !(target > 0)) return [];
  const roundedDebts = debts.map((d) => roundSplitMoney(Math.max(0, d)));
  const totalDebt = roundSplitMoney(roundedDebts.reduce((s, d) => s + d, 0));
  let amounts: number[];
  if (totalDebt > 0) {
    let remaining = target;
    amounts = roundedDebts.map((debt) => {
      const amount = roundSplitMoney(Math.min(remaining, debt));
      remaining = roundSplitMoney(remaining - amount);
      return amount;
    });
    if (remaining > 0) {
      amounts[amounts.length - 1] = roundSplitMoney(amounts[amounts.length - 1]! + remaining);
    }
  } else {
    const per = roundSplitMoney(target / debts.length);
    amounts = debts.map((_, i) =>
      i === debts.length - 1 ? roundSplitMoney(target - per * (debts.length - 1)) : per,
    );
  }
  const sum = roundSplitMoney(amounts.reduce((s, a) => s + a, 0));
  const drift = roundSplitMoney(target - sum);
  if (drift !== 0 && amounts.length > 0) {
    amounts[amounts.length - 1] = roundSplitMoney(amounts[amounts.length - 1]! + drift);
  }
  return amounts;
}

function rowsFromSorted(
  sorted: SplitOrder[],
  totalAmount: number,
  paymentCurrency: string,
): SplitRow[] {
  const debts = sorted.map((o) => orderDebtInPaymentCurrency(o, paymentCurrency));
  const amounts = allocateAmounts(debts, totalAmount);
  return sorted
    .map((o, i) => ({
      orderId: o.id,
      orderNumber: o.orderNumber ?? o.id,
      amount: (amounts[i] ?? 0).toFixed(2),
    }))
    .filter((r) => parseFloat(r.amount) > 0);
}

/** Prefill split rows using debts converted into the payment currency (FIFO by due date). */
export function buildSplitRowsFromOrdersFifo(
  orders: SplitOrder[],
  totalAmount: number,
  paymentCurrency: string,
): SplitRow[] {
  const sorted = [...orders].sort((a, b) => {
    const aDue = a.paymentDueDate ? new Date(a.paymentDueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const bDue = b.paymentDueDate ? new Date(b.paymentDueDate).getTime() : Number.MAX_SAFE_INTEGER;
    if (aDue !== bDue) return aDue - bDue;
    return new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
  });
  return rowsFromSorted(sorted, totalAmount, paymentCurrency);
}

/** Prefill split rows using debts converted into the payment currency (oldest first). */
export function buildSplitRowsFromOrders(
  orders: SplitOrder[],
  totalAmount: number,
  paymentCurrency: string,
): SplitRow[] {
  const sorted = [...orders].sort(
    (a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime(),
  );
  return rowsFromSorted(sorted, totalAmount, paymentCurrency);
}

/** Cap a picked order's debt to whatever is still unallocated in the other rows. */
export function suggestedRowAmount(
  order: SplitOrder,
  paymentCurrency: string,
  rows: Array<{ amount: string }>,
  rowIndex: number,
  totalAmount: number,
): string {
  const suggested = orderDebtInPaymentCurrency(order, paymentCurrency);
  if (!(suggested > 0)) return "";
  const used = rows.reduce((sum, row, index) => {
    if (index === rowIndex) return sum;
    const n = parseFloat(String(row.amount).replace(/,/g, "."));
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  const remaining = roundSplitMoney(totalAmount - used);
  if (!(remaining > 0)) return "";
  return Math.min(suggested, remaining).toFixed(2);
}

/**
 * Turn a server proposal into split rows. A drift of at most 1 currency unit
 * (debt tolerance) is absorbed by the last row so the distribute button can submit.
 */
export function rowsFromProposedAllocations(
  allocs: Array<{ orderId: string; amount: number }>,
  orderNumbers: ReadonlyMap<string, string>,
  totalAmount: number,
): SplitRow[] {
  const rows: SplitRow[] = allocs
    .filter((a) => a.orderId && Number(a.amount) > 0)
    .map((a) => ({
      orderId: a.orderId,
      orderNumber: orderNumbers.get(a.orderId) || a.orderId,
      amount: roundSplitMoney(Number(a.amount)).toFixed(2),
    }));
  if (rows.length === 0) return rows;
  const amounts = rows.map((r) => parseFloat(r.amount));
  const sum = roundSplitMoney(amounts.reduce((s, a) => s + a, 0));
  const goal = roundSplitMoney(totalAmount);
  const drift = roundSplitMoney(goal - sum);
  if (drift !== 0 && Math.abs(drift) <= 1) {
    const next = roundSplitMoney(amounts[amounts.length - 1]! + drift);
    if (next > 0) amounts[amounts.length - 1] = next;
  }
  return rows
    .map((r, i) => ({ ...r, amount: amounts[i]!.toFixed(2) }))
    .filter((r) => parseFloat(r.amount) > 0);
}
