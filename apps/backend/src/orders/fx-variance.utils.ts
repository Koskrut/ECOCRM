import { PaymentSourceType, PaymentStatus } from "@prisma/client";

export const FX_MAX_WRITE_OFF_USD = 2.0;
export const FX_MAX_RESIDUAL_UAH = 50;

export type FxVarianceOrderInput = {
  currency: string;
  exchangeRate: number | null;
  totalAmount: number;
  returnAdjustmentAmount?: number | null;
  paidAmount: number;
  debtAmount: number;
  fxWriteOffAmount?: number | null;
  orderStage?: string | null;
  openReturnCount?: number;
};

export type FxVariancePaymentInput = {
  amount: number;
  currency: string;
  status: string;
  sourceType: string;
};

export type FxVarianceSnapshot = {
  effectiveTotalUsd: number;
  expectedUah: number;
  paidUah: number;
  paidUsd: number;
  debtUsd: number;
  residualUah: number;
  isCandidate: boolean;
  suggestedWriteOffUsd: number;
  canAutoComplete: boolean;
};

function isForeignCurrency(currency: string): boolean {
  const c = (currency || "USD").trim().toUpperCase();
  return c === "USD" || c === "EUR";
}

export function computeFxVarianceSnapshot(
  order: FxVarianceOrderInput,
  payments: FxVariancePaymentInput[],
  opts?: { maxWriteOffUsd?: number; maxResidualUah?: number },
): FxVarianceSnapshot {
  const maxWriteOffUsd = opts?.maxWriteOffUsd ?? FX_MAX_WRITE_OFF_USD;
  const maxResidualUah = opts?.maxResidualUah ?? FX_MAX_RESIDUAL_UAH;

  const effectiveTotalUsd = Math.max(
    0,
    Number(order.totalAmount ?? 0) - Number(order.returnAdjustmentAmount ?? 0),
  );
  const rate = Number(order.exchangeRate ?? 0);
  const paidUsd = Number(order.paidAmount ?? 0);
  const fxWriteOff = Number(order.fxWriteOffAmount ?? 0);
  const debtUsd = Math.max(0, effectiveTotalUsd - paidUsd - fxWriteOff);

  const paidUah = payments
    .filter(
      (p) =>
        p.status === PaymentStatus.COMPLETED &&
        (p.sourceType === PaymentSourceType.BANK || p.sourceType === PaymentSourceType.CASH) &&
        (p.currency || "").trim().toUpperCase() === "UAH",
    )
    .reduce((s, p) => s + Number(p.amount), 0);

  const expectedUah = rate > 0 ? effectiveTotalUsd * rate : 0;
  const residualUah = expectedUah - paidUah;

  const hasCompletedPayment = payments.some(
    (p) =>
      p.status === PaymentStatus.COMPLETED &&
      (p.sourceType === PaymentSourceType.BANK || p.sourceType === PaymentSourceType.CASH),
  );

  const isCandidate =
    isForeignCurrency(order.currency) &&
    rate > 0 &&
    debtUsd > 0 &&
    debtUsd <= maxWriteOffUsd + 0.00001 &&
    Math.abs(residualUah) <= maxResidualUah &&
    hasCompletedPayment;

  const canAutoComplete =
    order.orderStage === "RECEIVED" && (order.openReturnCount ?? 0) === 0;

  return {
    effectiveTotalUsd,
    expectedUah,
    paidUah,
    paidUsd,
    debtUsd,
    residualUah,
    isCandidate,
    suggestedWriteOffUsd: debtUsd,
    canAutoComplete,
  };
}
