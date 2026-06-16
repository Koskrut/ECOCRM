import { BadRequestException } from "@nestjs/common";

/** Shared payment snapshot for stage / completion guards. */
export type OrderPaymentContext = {
  totalAmount?: number | null;
  paidAmount?: number | null;
  debtAmount?: number | null;
  returnAdjustmentAmount?: number | null;
  fxWriteOffAmount?: number | null;
};

const DEBT_EPSILON = 0.00001;

export function computeEffectiveTotal(ctx: OrderPaymentContext): number {
  return Math.max(
    0,
    Number(ctx.totalAmount ?? 0) - Number(ctx.returnAdjustmentAmount ?? 0),
  );
}

/** Debt after returns; prefers persisted debtAmount when present. */
export function computeEffectiveDebt(ctx: OrderPaymentContext): number {
  if (ctx.debtAmount != null && Number.isFinite(Number(ctx.debtAmount))) {
    return Math.max(0, Number(ctx.debtAmount));
  }
  const effectiveTotal = computeEffectiveTotal(ctx);
  const fxWriteOff = Number(ctx.fxWriteOffAmount ?? 0);
  return Math.max(0, effectiveTotal - Number(ctx.paidAmount ?? 0) - fxWriteOff);
}

export function isPaymentClosed(ctx: OrderPaymentContext): boolean {
  return computeEffectiveDebt(ctx) <= DEBT_EPSILON;
}

export function assertPaymentClosedForCompletion(ctx: OrderPaymentContext): void {
  const debt = computeEffectiveDebt(ctx);
  if (debt > DEBT_EPSILON) {
    throw new BadRequestException(
      `Cannot complete order: payment is not closed (debt ${debt.toFixed(2)}). Pay the order or apply client credit first.`,
    );
  }
}

export function assertPrepaymentSatisfiedForStage(ctx: OrderPaymentContext): void {
  const effectiveTotal = computeEffectiveTotal(ctx);
  const paid = Number(ctx.paidAmount ?? 0);
  if (effectiveTotal > DEBT_EPSILON && paid < effectiveTotal - DEBT_EPSILON) {
    throw new BadRequestException(
      "Prepayment order must be fully paid before moving to this stage. Pay the order first.",
    );
  }
}
