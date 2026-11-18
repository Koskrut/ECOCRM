import type { OrderStage } from "@prisma/client";
import { getBaseCurrency, toBaseCurrency } from "../common/currency.util";
import { isDebtOverdueByDueDate } from "../orders/order-status-sync.mapper";
import { isOperationalDebtOrder, isPreShipPaymentOrder } from "../receivables/receivables-scope.util";
import type { ExchangeRates } from "../settings/settings.service";

/** Prisma Decimal and plain numbers both flow in from order/balance rows. */
type MoneyLike = number | string | null | undefined | { toString(): string };

const CLOSED_CASH_STAGES = new Set<OrderStage>(["CANCELED", "REFUSED"]);

export type ClientFinanceOrderInput = {
  totalAmount?: MoneyLike;
  returnAdjustmentAmount?: MoneyLike;
  debtAmount?: MoneyLike;
  creditAmount?: MoneyLike;
  /** Money already received, in the order currency. Used for pre-ship and closed-order advances. */
  paidAmount?: MoneyLike;
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
  /** Operational debt, before order credit, advance, and wallet. */
  grossDebt: number;
  /** Overdue operational debt by due date. Cash on other orders does not reduce this. */
  overdue: number;
  /** Overpayment still sitting on operational orders (not yet moved to the wallet). */
  orderCredit: number;
  /**
   * Money without an open receivable: pre-ship payments plus cash on canceled/refused orders.
   */
  advance: number;
  /** Client wallet, converted to the base currency. */
  clientBalance: number;
  /** max(0, grossDebt − orderCredit − advance − clientBalance). */
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

function num(value: MoneyLike): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Client debt after available cash. Overdue invoices stay as they are. */
export function clientNetDebt(debtBase: number, cashBase: number): number {
  return Math.max(0, money(finite(debtBase) - Math.max(0, finite(cashBase))));
}

/**
 * @deprecated Use clientNetDebt. Kept for callers that still pass overdue; overdue is returned unchanged.
 */
export function clientDebtAfterOrderCredit(
  debtBase: number,
  creditBase: number,
  overdueBase = 0,
): { debt: number; overdue: number } {
  const debt = clientNetDebt(debtBase, creditBase);
  const overdueRaw = Math.min(Math.max(0, finite(overdueBase)), Math.max(0, finite(debtBase)));
  return { debt, overdue: money(overdueRaw) };
}

export function isClosedCashOrder(order: {
  orderStage?: OrderStage | null;
  legacySource?: string | null;
}): boolean {
  if (order.legacySource === "bitrix") return false;
  return order.orderStage != null && CLOSED_CASH_STAGES.has(order.orderStage);
}

/**
 * Cash already on an order that is not an open receivable.
 * Prefers paidAmount for pre-ship. For canceled/refused prefers creditAmount, else paidAmount.
 */
export function earlyOrderCash(order: {
  orderStage?: OrderStage | null;
  legacySource?: string | null;
  paidAmount?: MoneyLike;
  creditAmount?: MoneyLike;
}): number {
  if (isClosedCashOrder(order)) {
    const credit = Math.max(0, num(order.creditAmount));
    if (credit > 0) return credit;
    return Math.max(0, num(order.paidAmount));
  }
  if (!isPreShipPaymentOrder(order)) return 0;
  const paid = Math.max(0, num(order.paidAmount));
  if (paid > 0) return paid;
  return Math.max(0, num(order.creditAmount));
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
  let advance = 0;
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
    } else {
      const cash = earlyOrderCash(order);
      if (cash > 0) advance += toBaseCurrency(cash, orderCurrency, rates);
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
  const advanceAmount = money(advance);
  const balance = money(clientBalance);
  const cash = money(credit + advanceAmount + balance);

  return {
    currency,
    revenue: money(revenue),
    grossDebt: gross,
    overdue: money(overdue),
    orderCredit: credit,
    advance: advanceAmount,
    clientBalance: balance,
    netDebt: clientNetDebt(gross, cash),
    ordersWithDebtCount,
    bitrixDebt: money(bitrixDebt),
  };
}

/**
 * Sum client nets one contact at a time so one client's advance cannot close another's debt.
 */
export function sumClientFinanceByContact(
  orders: Array<ClientFinanceOrderInput & { clientId?: string | null }>,
  balances: Array<ClientFinanceBalanceInput & { holderId: string }>,
  rates: ExchangeRates,
  now = new Date(),
): {
  debtTotal: number;
  overdueTotal: number;
  byClient: Map<string, ClientFinanceSnapshot>;
} {
  const ordersByClient = new Map<string, ClientFinanceOrderInput[]>();
  for (const order of orders) {
    if (!order.clientId) continue;
    const list = ordersByClient.get(order.clientId) ?? [];
    list.push(order);
    ordersByClient.set(order.clientId, list);
  }
  const balancesByClient = new Map<string, ClientFinanceBalanceInput[]>();
  for (const row of balances) {
    const list = balancesByClient.get(row.holderId) ?? [];
    list.push(row);
    balancesByClient.set(row.holderId, list);
  }

  const clientIds = new Set([...ordersByClient.keys(), ...balancesByClient.keys()]);
  const byClient = new Map<string, ClientFinanceSnapshot>();
  let debtTotal = 0;
  let overdueTotal = 0;
  for (const id of clientIds) {
    const snap = aggregateClientFinance(
      ordersByClient.get(id) ?? [],
      balancesByClient.get(id) ?? [],
      rates,
      now,
    );
    byClient.set(id, snap);
    debtTotal += snap.netDebt;
    overdueTotal += snap.overdue;
  }
  return {
    debtTotal: money(debtTotal),
    overdueTotal: money(overdueTotal),
    byClient,
  };
}
