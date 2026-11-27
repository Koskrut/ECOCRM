import { fromUsd, normalizeCurrencyCode, toUsd } from "../common/currency.util";
import { computeEffectiveTotal } from "../orders/order-payment-guards";
import { paymentAmountInOrderCurrency as paymentInOrderCurrency } from "../payments/order-finance.utils";
import { PRE_SHIP_PAYMENT_STAGES } from "../receivables/receivables.constants";
import type { ExchangeRates } from "../settings/settings.service";

/** Stages with no bonusable debt (void / full return). */
export const DEBT_CLOSED_STAGES = new Set(["CANCELED", "REFUSED", "FULLY_RETURNED"]);

/**
 * Orders that do not count toward sales bonus base.
 * Same “real sale” cut as dashboard booked KPI: READY_TO_SHIP+ only
 * (pre-ship NEW…CONFIRMED excluded even if fully prepaid) + voids / full return.
 * Legacy null orderStage still allowed.
 */
export const BONUS_EXCLUDED_STAGES = new Set<string>([
  ...DEBT_CLOSED_STAGES,
  ...PRE_SHIP_PAYMENT_STAGES,
]);

export type PayrollCompanyRates = {
  thresholdUsd: number;
  percentUpTo: number;
  percentAbove: number;
  leadTeamBonusPercent: number;
};

export type PayrollPersonalRates = {
  baseSalaryUah: number;
  amortizationUahPerKm: number;
  bonusThresholdUsd: number | null;
  bonusPercentUpTo: number | null;
  bonusPercentAbove: number | null;
};

export type ResolvedBonusRates = {
  thresholdUsd: number;
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
  amountEstimated: number | null;
  compensationStatus: string;
};

export type PayrollOrderLine = {
  orderId: string;
  orderNumber: string;
  closedAt: string;
  currency: string;
  amountOriginal: number;
  /** Effective total converted to USD for bonus base. */
  amountUsd: number;
  rateFallback: boolean;
};

export type PayrollFuelDayLine = {
  date: string;
  km: number;
  /** Amortization UAH for the day (km × rate). */
  amountUah: number;
  /** Fuel compensation estimate from FuelDayReport.amountEstimated. */
  fuelCompensationUah: number;
};

export type PayrollMonthResult = {
  month: string;
  baseSalaryUah: number;
  /** Fully paid own sales in USD. */
  salesBaseUsd: number;
  bonusRates: ResolvedBonusRates;
  appliedPercent: number;
  /** Sales bonus in USD. */
  bonusUsd: number;
  /** Bonus converted to UAH at settings rate (for payroll total). */
  bonusUah: number;
  /** Fully paid sales base of subordinate managers in USD (LEAD only). */
  teamSalesBaseUsd: number;
  leadTeamBonusPercent: number;
  leadTeamBonusUsd: number;
  leadTeamBonusUah: number;
  /** UAH per 1 USD used to convert bonuses into payroll total. */
  usdToUahRate: number;
  amortizationUahPerKm: number;
  totalKm: number;
  amortizationUah: number;
  /** Sum of fuel day amountEstimated (not part of payroll total). */
  fuelCompensationUah: number;
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
    "bonusThresholdUsd" | "bonusPercentUpTo" | "bonusPercentAbove"
  >,
): ResolvedBonusRates {
  const hasPersonal =
    personal.bonusThresholdUsd != null &&
    personal.bonusPercentUpTo != null &&
    personal.bonusPercentAbove != null;
  if (hasPersonal) {
    return {
      thresholdUsd: Number(personal.bonusThresholdUsd),
      percentUpTo: Number(personal.bonusPercentUpTo),
      percentAbove: Number(personal.bonusPercentAbove),
      source: "personal",
    };
  }
  return {
    thresholdUsd: company.thresholdUsd,
    percentUpTo: company.percentUpTo,
    percentAbove: company.percentAbove,
    source: "company",
  };
}

/** Cliff: one percent on the whole month total (USD). */
export function computeSalesBonusUsd(
  salesBaseUsd: number,
  rates: ResolvedBonusRates,
): { appliedPercent: number; bonusUsd: number } {
  const base = Math.max(0, salesBaseUsd);
  const appliedPercent = base > rates.thresholdUsd ? rates.percentAbove : rates.percentUpTo;
  return {
    appliedPercent,
    bonusUsd: roundMoney((base * appliedPercent) / 100),
  };
}

/** LEAD: flat % of subordinate managers' paid sales base (USD). */
export function computeLeadTeamBonusUsd(teamSalesBaseUsd: number, percent: number): number {
  const base = Math.max(0, teamSalesBaseUsd);
  const p = Math.max(0, percent);
  return roundMoney((base * p) / 100);
}

export function usdToUah(usd: number, rates: ExchangeRates): number {
  return roundMoney(fromUsd(usd, "UAH", rates));
}

export function paymentAmountInOrderCurrency(
  payment: { amount: number; currency?: string | null; amountUsd?: number | null },
  orderCurrency: string | null | undefined,
  rates: ExchangeRates,
): number {
  return paymentInOrderCurrency(payment, orderCurrency, rates);
}

/**
 * Order effective total → USD for bonus base.
 * USD orders use face amount. Other currencies: order.exchangeRate (UAH per unit)
 * → UAH → USD when available, else settings rates.
 */
export function orderAmountToUsd(
  amount: number,
  currency: string | null | undefined,
  exchangeRate: number | null | undefined,
  rates: ExchangeRates,
): { amountUsd: number; rateFallback: boolean } {
  const c = normalizeCurrencyCode(currency);
  if (c === "USD") {
    return { amountUsd: roundMoney(amount), rateFallback: false };
  }
  const fixed = Number(exchangeRate);
  if (Number.isFinite(fixed) && fixed > 0 && rates.UAH_TO_USD > 0) {
    const uah = amount * fixed;
    return { amountUsd: roundMoney(uah * rates.UAH_TO_USD), rateFallback: false };
  }
  return { amountUsd: roundMoney(toUsd(amount, c, rates)), rateFallback: true };
}

/**
 * First COMPLETED payment (by paidAt) that closes debt = effectiveTotal − fxWriteOff.
 * Includes negative CREDIT_TRANSFER amounts so moving credit away does not close early.
 */
export function findOrderClosePayment(
  order: PayrollOrderInput,
  rates: ExchangeRates,
): { closedAt: Date; effectiveTotal: number } | null {
  if (order.orderStage && BONUS_EXCLUDED_STAGES.has(order.orderStage)) return null;

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

export function selectFuelCompensationUah(day: PayrollFuelDayInput): number {
  if (day.compensationStatus === "REJECTED") return 0;
  if (day.amountEstimated == null) return 0;
  const n = Number(day.amountEstimated);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return roundMoney(n);
}

export function accruePayrollMonth(input: {
  month: string;
  companyRates: PayrollCompanyRates;
  personal: PayrollPersonalRates;
  orders: PayrollOrderInput[];
  fuelDays: PayrollFuelDayInput[];
  rates: ExchangeRates;
  /** Sum of managers' salesBaseUsd for LEAD override; 0 for managers. */
  teamSalesBaseUsd?: number;
}): PayrollMonthResult {
  const bonusRates = resolveBonusRates(input.companyRates, input.personal);
  const { from, toExclusive } = kyivMonthBounds(input.month);
  const usdToUahRate =
    input.rates.UAH_TO_USD > 0 ? roundMoney(1 / input.rates.UAH_TO_USD) : 0;

  const orderLines: PayrollOrderLine[] = [];
  for (const order of input.orders) {
    const closed = findOrderClosePayment(order, input.rates);
    if (!closed) continue;
    if (closed.closedAt < from || closed.closedAt >= toExclusive) continue;

    const converted = orderAmountToUsd(
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
      amountUsd: converted.amountUsd,
      rateFallback: converted.rateFallback,
    });
  }

  orderLines.sort((a, b) => a.closedAt.localeCompare(b.closedAt) || a.orderNumber.localeCompare(b.orderNumber));

  const salesBaseUsd = roundMoney(orderLines.reduce((s, o) => s + o.amountUsd, 0));
  const { appliedPercent, bonusUsd } = computeSalesBonusUsd(salesBaseUsd, bonusRates);
  const bonusUah = usdToUah(bonusUsd, input.rates);

  const fuelDays: PayrollFuelDayLine[] = [];
  let totalKm = 0;
  let fuelCompensationUah = 0;
  for (const day of input.fuelDays) {
    const ymd = kyivYmd(day.date);
    if (!ymd.startsWith(input.month)) continue;
    const km = selectFuelKm(day);
    const fuelComp = selectFuelCompensationUah(day);
    if (km <= 0 && fuelComp <= 0) continue;
    totalKm += km;
    fuelCompensationUah += fuelComp;
    fuelDays.push({
      date: ymd,
      km: roundKm(km),
      amountUah: roundMoney(km * input.personal.amortizationUahPerKm),
      fuelCompensationUah: fuelComp,
    });
  }
  fuelDays.sort((a, b) => a.date.localeCompare(b.date));
  totalKm = roundKm(totalKm);
  fuelCompensationUah = roundMoney(fuelCompensationUah);
  const amortizationUah = roundMoney(totalKm * input.personal.amortizationUahPerKm);
  const baseSalaryUah = roundMoney(Math.max(0, input.personal.baseSalaryUah));
  const teamSalesBaseUsd = roundMoney(Math.max(0, input.teamSalesBaseUsd ?? 0));
  const leadTeamBonusPercent = Math.max(0, input.companyRates.leadTeamBonusPercent ?? 0);
  const leadTeamBonusUsd = computeLeadTeamBonusUsd(teamSalesBaseUsd, leadTeamBonusPercent);
  const leadTeamBonusUah = usdToUah(leadTeamBonusUsd, input.rates);

  return {
    month: input.month,
    baseSalaryUah,
    salesBaseUsd,
    bonusRates,
    appliedPercent,
    bonusUsd,
    bonusUah,
    teamSalesBaseUsd,
    leadTeamBonusPercent,
    leadTeamBonusUsd,
    leadTeamBonusUah,
    usdToUahRate,
    amortizationUahPerKm: input.personal.amortizationUahPerKm,
    totalKm,
    amortizationUah,
    fuelCompensationUah,
    totalUah: roundMoney(baseSalaryUah + bonusUah + leadTeamBonusUah + amortizationUah),
    orders: orderLines,
    fuelDays,
  };
}

export function validatePersonalBonusTriplet(input: {
  bonusThresholdUsd?: number | null;
  bonusPercentUpTo?: number | null;
  bonusPercentAbove?: number | null;
}): { ok: true } | { ok: false; message: string } {
  const vals = [input.bonusThresholdUsd, input.bonusPercentUpTo, input.bonusPercentAbove];
  const nullCount = vals.filter((v) => v == null).length;
  if (nullCount === 3 || nullCount === 0) {
    if (nullCount === 0) {
      if (!(Number(input.bonusThresholdUsd) >= 0)) {
        return { ok: false, message: "bonusThresholdUsd must be >= 0" };
      }
      if (!(Number(input.bonusPercentUpTo) >= 0) || !(Number(input.bonusPercentAbove) >= 0)) {
        return { ok: false, message: "bonus percents must be >= 0" };
      }
    }
    return { ok: true };
  }
  return {
    ok: false,
    message: "bonusThresholdUsd, bonusPercentUpTo and bonusPercentAbove must all be set or all empty",
  };
}
