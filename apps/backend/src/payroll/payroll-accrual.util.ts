import { computeOrderExchangeRate, normalizeCurrencyCode } from "../common/currency.util";
import type { ExchangeRates } from "../settings/settings.service";
import { computeEffectiveTotal } from "../orders/order-payment-guards";
import { paymentAmountInOrderCurrency as paymentInOrderCurrency } from "../payments/order-finance.utils";

export const DEBT_CLOSED_STAGES = new Set(["CANCELED", "REFUSED", "FULLY_RETURNED"]);

export type PayrollCompanyRates = {
  thresholdUah: number;
  percentUpTo: number;
  percentAbove: number;
};

export type PayrollPersonalRates = {
  baseSalaryUah: number;
  amortizationUahPerKm: number;
  bonusThresholdUah: number | null;
  bonusPercentUpTo: number | null;
  bonusPercentAbove: number | null;
};

export type ResolvedBonusRates = {
  thresholdUah: number;
  percentUpTo: number;
  percentAbove: number;
  source: "company" | "personal";
};

export type PayrollPaymentInput = {
  amount: number;
  currency: string | null | undefined;
  amountUsd: number | null | undefined;
  paidAt: Date;
  status: string;
};

export type PayrollOrderInput = {
  id: string;
  orderNumber: string;
  ownerId: string;
  currency: string | null | undefined;
  totalAmount: number;
  returnAdjustmentAmount: number;
  fxWriteOffAmount: number;
  exchangeRate: number | null | undefined;
  orderStage: string | null | undefined;
  payments: PayrollPaymentInput[];
};

export type PayrollFuelDayInput = {
  date: Date;
  compensationKm: number | null;
  actualKm: number | null;
  compensationStatus: string;
};

export type PayrollOrderLine = {
  orderId: string;
  orderNumber: string;
  closedAt: string;
  currency: string;
  amountOriginal: number;
  exchangeRate: number;
  amountUah: number;
  rateFallback: boolean;
};

export type PayrollFuelDayLine = {
  date: string;
  km: number;
  amountUah: number;
};

export type PayrollMonthResult = {
  month: string;
  baseSalaryUah: number;
  salesBaseUah: number;
  bonusRates: ResolvedBonusRates;
  appliedPercent: number;
  bonusUah: number;
  amortizationUahPerKm: number;
  totalKm: number;
  amortizationUah: number;
  totalUah: number;
  orders: PayrollOrderLine[];
  fuelDays: PayrollFuelDayLine[];
};

const KYIV = "Europe/Kyiv";

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function roundKm(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function parseMonthYm(raw: string | undefined, fallback: Date = new Date()): string {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) return raw;
  const parts = kyivYmdParts(fallback);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

export function kyivYmdParts(date: Date): { year: number; month: number; day: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: KYIV,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
}

export function kyivYmd(date: Date): string {
  const p = kyivYmdParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function kyivMonthBounds(monthYm: string): { from: Date; toExclusive: Date } {
  const [y, m] = monthYm.split("-").map(Number);
  const fromYmd = `${y}-${String(m).padStart(2, "0")}-01`;
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const toYmd = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
  return { from: kyivMidnightUtc(fromYmd), toExclusive: kyivMidnightUtc(toYmd) };
}

/** UTC instant of 00:00 Europe/Kyiv on that calendar day. */
export function kyivMidnightUtc(ymd: string): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: KYIV,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(guess)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  const offset =
    Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour) % 24,
      Number(map.minute),
      0,
    ) - guess.getTime();
  return new Date(guess.getTime() - offset);
}

export function resolveBonusRates(
  company: PayrollCompanyRates,
  personal: Pick<
    PayrollPersonalRates,
    "bonusThresholdUah" | "bonusPercentUpTo" | "bonusPercentAbove"
  >,
): ResolvedBonusRates {
  const hasPersonal =
    personal.bonusThresholdUah != null &&
    personal.bonusPercentUpTo != null &&
    personal.bonusPercentAbove != null;
  if (hasPersonal) {
    return {
      thresholdUah: Number(personal.bonusThresholdUah),
      percentUpTo: Number(personal.bonusPercentUpTo),
      percentAbove: Number(personal.bonusPercentAbove),
      source: "personal",
    };
  }
  return {
    thresholdUah: company.thresholdUah,
    percentUpTo: company.percentUpTo,
    percentAbove: company.percentAbove,
    source: "company",
  };
}

/** Cliff: one percent on the whole month total. */
export function computeSalesBonusUah(
  salesBaseUah: number,
  rates: ResolvedBonusRates,
): { appliedPercent: number; bonusUah: number } {
  const base = Math.max(0, salesBaseUah);
  const appliedPercent = base > rates.thresholdUah ? rates.percentAbove : rates.percentUpTo;
  return {
    appliedPercent,
    bonusUah: roundMoney((base * appliedPercent) / 100),
  };
}

export function paymentAmountInOrderCurrency(
  payment: { amount: number; currency?: string | null; amountUsd?: number | null },
  orderCurrency: string | null | undefined,
  rates: ExchangeRates,
): number {
  return paymentInOrderCurrency(payment, orderCurrency, rates);
}

export function orderAmountToUahWithRate(
  amount: number,
  currency: string | null | undefined,
  exchangeRate: number | null | undefined,
  rates: ExchangeRates,
): { amountUah: number; exchangeRate: number; rateFallback: boolean } {
  const c = normalizeCurrencyCode(currency);
  if (c === "UAH") {
    return { amountUah: roundMoney(amount), exchangeRate: 1, rateFallback: false };
  }
  const fixed = Number(exchangeRate);
  if (Number.isFinite(fixed) && fixed > 0) {
    return { amountUah: roundMoney(amount * fixed), exchangeRate: fixed, rateFallback: false };
  }
  const fallback = computeOrderExchangeRate(c, rates);
  if (fallback != null && fallback > 0) {
    return { amountUah: roundMoney(amount * fallback), exchangeRate: fallback, rateFallback: true };
  }
  return { amountUah: roundMoney(amount), exchangeRate: 1, rateFallback: true };
}

/**
 * First COMPLETED payment (by paidAt) that closes debt = effectiveTotal − fxWriteOff.
 * Includes negative CREDIT_TRANSFER amounts so moving credit away does not close early.
 */
export function findOrderClosePayment(
  order: PayrollOrderInput,
  rates: ExchangeRates,
): { closedAt: Date; effectiveTotal: number } | null {
  if (order.orderStage && DEBT_CLOSED_STAGES.has(order.orderStage)) return null;

  const effectiveTotal = computeEffectiveTotal({
    totalAmount: order.totalAmount,
    returnAdjustmentAmount: order.returnAdjustmentAmount,
  });
  const fxWriteOff = Math.max(0, Number(order.fxWriteOffAmount ?? 0));
  const closeTarget = Math.max(0, effectiveTotal - fxWriteOff);
  if (closeTarget <= 0.00001) return null;

  const payments = [...order.payments]
    .filter((p) => p.status === "COMPLETED")
    .sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());

  let paid = 0;
  let wasClosed = false;
  let closedAt: Date | null = null;
  for (const p of payments) {
    paid += paymentAmountInOrderCurrency(p, order.currency, rates);
    const closed = paid + 0.00001 >= closeTarget;
    if (closed && !wasClosed) closedAt = p.paidAt;
    if (!closed) closedAt = null;
    wasClosed = closed;
  }
  if (!wasClosed || !closedAt) return null;
  return { closedAt, effectiveTotal };
}

export function selectFuelKm(day: PayrollFuelDayInput): number {
  if (day.compensationStatus === "REJECTED") return 0;
  if (day.compensationKm != null && Number.isFinite(day.compensationKm)) {
    return Math.max(0, day.compensationKm);
  }
  if (day.actualKm != null && Number.isFinite(day.actualKm)) {
    return Math.max(0, day.actualKm);
  }
  return 0;
}

export function accruePayrollMonth(input: {
  month: string;
  companyRates: PayrollCompanyRates;
  personal: PayrollPersonalRates;
  orders: PayrollOrderInput[];
  fuelDays: PayrollFuelDayInput[];
  rates: ExchangeRates;
}): PayrollMonthResult {
  const bonusRates = resolveBonusRates(input.companyRates, input.personal);
  const { from, toExclusive } = kyivMonthBounds(input.month);

  const orderLines: PayrollOrderLine[] = [];
  for (const order of input.orders) {
    const closed = findOrderClosePayment(order, input.rates);
    if (!closed) continue;
    if (closed.closedAt < from || closed.closedAt >= toExclusive) continue;

    const converted = orderAmountToUahWithRate(
      closed.effectiveTotal,
      order.currency,
      order.exchangeRate,
      input.rates,
    );
    orderLines.push({
      orderId: order.id,
      orderNumber: order.orderNumber,
      closedAt: kyivYmd(closed.closedAt),
      currency: normalizeCurrencyCode(order.currency),
      amountOriginal: roundMoney(closed.effectiveTotal),
      exchangeRate: converted.exchangeRate,
      amountUah: converted.amountUah,
      rateFallback: converted.rateFallback,
    });
  }

  orderLines.sort((a, b) => a.closedAt.localeCompare(b.closedAt) || a.orderNumber.localeCompare(b.orderNumber));

  const salesBaseUah = roundMoney(orderLines.reduce((s, o) => s + o.amountUah, 0));
  const { appliedPercent, bonusUah } = computeSalesBonusUah(salesBaseUah, bonusRates);

  const fuelDays: PayrollFuelDayLine[] = [];
  let totalKm = 0;
  for (const day of input.fuelDays) {
    const ymd = kyivYmd(day.date);
    if (!ymd.startsWith(input.month)) continue;
    const km = selectFuelKm(day);
    if (km <= 0) continue;
    totalKm += km;
    fuelDays.push({
      date: ymd,
      km: roundKm(km),
      amountUah: roundMoney(km * input.personal.amortizationUahPerKm),
    });
  }
  fuelDays.sort((a, b) => a.date.localeCompare(b.date));
  totalKm = roundKm(totalKm);
  const amortizationUah = roundMoney(totalKm * input.personal.amortizationUahPerKm);
  const baseSalaryUah = roundMoney(Math.max(0, input.personal.baseSalaryUah));

  return {
    month: input.month,
    baseSalaryUah,
    salesBaseUah,
    bonusRates,
    appliedPercent,
    bonusUah,
    amortizationUahPerKm: input.personal.amortizationUahPerKm,
    totalKm,
    amortizationUah,
    totalUah: roundMoney(baseSalaryUah + bonusUah + amortizationUah),
    orders: orderLines,
    fuelDays,
  };
}

export function validatePersonalBonusTriplet(input: {
  bonusThresholdUah?: number | null;
  bonusPercentUpTo?: number | null;
  bonusPercentAbove?: number | null;
}): { ok: true } | { ok: false; message: string } {
  const vals = [input.bonusThresholdUah, input.bonusPercentUpTo, input.bonusPercentAbove];
  const nullCount = vals.filter((v) => v == null).length;
  if (nullCount === 3 || nullCount === 0) {
    if (nullCount === 0) {
      if (!(Number(input.bonusThresholdUah) >= 0)) {
        return { ok: false, message: "bonusThresholdUah must be >= 0" };
      }
      if (!(Number(input.bonusPercentUpTo) >= 0) || !(Number(input.bonusPercentAbove) >= 0)) {
        return { ok: false, message: "bonus percents must be >= 0" };
      }
    }
    return { ok: true };
  }
  return {
    ok: false,
    message: "bonusThresholdUah, bonusPercentUpTo and bonusPercentAbove must all be set or all empty",
  };
}
