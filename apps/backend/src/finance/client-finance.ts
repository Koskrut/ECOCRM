import type { OrderStage } from "@prisma/client";
import { getBaseCurrency, toBaseCurrency } from "../common/currency.util";
import { isDebtOverdueByDueDate } from "../orders/order-status-sync.mapper";
import { isOperationalDebtOrder } from "../receivables/receivables-scope.util";
import type { ExchangeRates } from "../settings/settings.service";

/** Prisma Decimal and plain numbers both flow in from order/balance rows. */
type MoneyLike = number | string | null | undefined | { toString(): string };

export type ClientFinanceOrderInput = {
  totalAmount?: MoneyLike;
  returnAdjustmentAmount?: MoneyLike;
  debtAmount?: MoneyLike;
  creditAmount?: MoneyLike;
  currency?: string | null;
  orderStage?: OrderStage | null;
  legacySource?: string | null;
  paymentDueDate?: Date | string | null;
};

export type ClientFinanceBalanceInput = {
  amount?: MoneyLike;
  currency?: string | null;
};

export type ClientFinanceSnapshot = {
  /** Base currency from exchange settings. */
  currency: string;
  /** Sales after returns. Canceled and Bitrix orders are excluded; pre-ship orders count. */
  revenue: number;
  /** Operational debt, before order credit and wallet balance. */
  grossDebt: number;
  /** Overdue operational debt after order overpayments. Wallet balance is not applied here. */
  overdue: number;
  /** Overpayment still sitting on operational orders (not yet moved to the wallet). */
  orderCredit: number;
  /** Client wallet, converted to the base currency. */
  clientBalance: number;
  /** max(0, grossDebt − orderCredit − clientBalance). */
  netDebt: number;
  ordersWithDebtCount: number;
  /** Bitrix legacy debt, kept out of grossDebt and reconciliation. */
  bitrixDebt: number;
};

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function finite(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/**
 * Client receivables after overpayments sitting on orders.
 * Credit pays the overdue part first, then the rest of the debt.
 */
export function clientDebtAfterOrderCredit(
  debtBase: number,
  creditBase: number,
  overdueBase = 0,
): { debt: number; overdue: number } {
  const debtRaw = finite(debtBase);
  const credit = Math.max(0, finite(creditBase));
  const overdueRaw = Math.min(Math.max(0, finite(overdueBase)), Math.max(0, debtRaw));
  const debt = Math.max(0, money(debtRaw - credit));
  const overdue = Math.min(debt, Math.max(0, money(overdueRaw - credit)));
  return { debt, overdue };
}

/** Take order overpayment off the oldest overdue invoices first. */
export function applyCreditToOverdueOrders<T extends { days: number; amount: number }>(
  orders: T[],
  creditBase: number,
): T[] {
  let left = Math.max(0, finite(creditBase));
  const ranked = [...orders].sort((a, b) => b.days - a.days);
  const out: T[] = [];
  for (const order of ranked) {
    if (!(order.amount > 0)) continue;
    if (left <= 0.0000001) {
      out.push(order);
      continue;
    }
    const cut = Math.min(order.amount, left);
    left = money(left - cut);
    const amount = money(order.amount - cut);
    if (amount > 0.009) out.push({ ...order, amount });
  }
  return out;
}

function num(value: MoneyLike): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function countsTowardClientRevenue(order: {
  orderStage?: OrderStage | null;
  legacySource?: string | null;
}): boolean {
  if (order.legacySource === "bitrix") return false;
  if (order.orderStage === "CANCELED") return false;
  if (order.orderStage === "REFUSED") return false;
  return true;
}

/**
 * One client position used by the contact card, contact list, and contact receivables.
 * Amounts are converted from each order/balance currency into the base currency.
 */
export function aggregateClientFinance(
  orders: ClientFinanceOrderInput[],
  balances: ClientFinanceBalanceInput[],
  rates: ExchangeRates,
  now = new Date(),
): ClientFinanceSnapshot {
  const currency = getBaseCurrency(rates);
  let revenue = 0;
  let grossDebt = 0;
  let overdue = 0;
  let orderCredit = 0;
  let ordersWithDebtCount = 0;
  let bitrixDebt = 0;

  for (const order of orders) {
    const orderCurrency = order.currency || currency;
    const debt = Math.max(0, toBaseCurrency(num(order.debtAmount), orderCurrency, rates));
    const credit = Math.max(0, toBaseCurrency(num(order.creditAmount), orderCurrency, rates));

    if (order.legacySource === "bitrix") {
      if (debt > 0) bitrixDebt += debt;
    } else if (isOperationalDebtOrder(order)) {
      if (debt > 0) {
        grossDebt += debt;
        ordersWithDebtCount += 1;
        if (isDebtOverdueByDueDate(asDate(order.paymentDueDate), debt, now)) overdue += debt;
      }
      if (credit > 0) orderCredit += credit;
    }

    if (countsTowardClientRevenue(order)) {
      const netSales = Math.max(0, num(order.totalAmount) - num(order.returnAdjustmentAmount));
      revenue += toBaseCurrency(netSales, orderCurrency, rates);
    }
  }

  let clientBalance = 0;
  for (const row of balances) {
    clientBalance += toBaseCurrency(num(row.amount), row.currency || currency, rates);
  }

  const gross = money(grossDebt);
  const credit = money(orderCredit);
  const balance = money(clientBalance);
  const position = clientDebtAfterOrderCredit(gross, credit, money(overdue));

  return {
    currency,
    revenue: money(revenue),
    grossDebt: gross,
    overdue: position.overdue,
    orderCredit: credit,
    clientBalance: balance,
    netDebt: money(Math.max(0, position.debt - balance)),
    ordersWithDebtCount,
    bitrixDebt: money(bitrixDebt),
  };
}
