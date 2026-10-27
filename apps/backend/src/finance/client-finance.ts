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
  /** Gross debt whose due date is before today in Europe/Kyiv. Includes prepayment. */
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

  return {
    currency,
    revenue: money(revenue),
    grossDebt: gross,
    overdue: money(overdue),
    orderCredit: credit,
    clientBalance: balance,
    netDebt: money(Math.max(0, gross - credit - balance)),
    ordersWithDebtCount,
    bitrixDebt: money(bitrixDebt),
  };
}
