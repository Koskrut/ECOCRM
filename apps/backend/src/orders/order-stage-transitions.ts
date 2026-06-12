/**
 * Phase 2: Allowed orderStage transitions and business validations.
 * Transition graph edges are supplied by caller (from DB pipeline config with fallback to defaults).
 * This module adds payment-type rules, cancel/refuse/return constraints, and prepayment payment gates.
 */

import type { DeliveryMethod, OrderStage, PaymentType } from "@prisma/client";
import { BadRequestException } from "@nestjs/common";
import { DEFAULT_FINAL_STAGE_ORDER, DEFAULT_MAIN_STAGE_ORDER } from "./pipeline/order-pipeline.defaults";
import {
  assertFinanciallyClosedForCompletion,
} from "./order-completion-guards";
import {
  assertPrepaymentSatisfiedForStage,
  type OrderPaymentContext,
} from "./order-payment-guards";
import {
  assertNovaPoshtaTtnBeforeConfirmed,
  assertPaymentTypeForForwardTransition,
} from "./order-stage-prerequisites";

const STAGES: OrderStage[] = [...DEFAULT_MAIN_STAGE_ORDER, ...DEFAULT_FINAL_STAGE_ORDER];

/** Stages that are "before shipment" for cancel rule. */
const BEFORE_SHIPPED: Set<OrderStage> = new Set([
  "NEW",
  "CONFIRMED",
  "AWAITING_PAYMENT",
  "AWAITING_STOCK",
  "READY_TO_SHIP",
]);

/** Stages that allow REFUSED (refusal of delivery). */
const CAN_REFUSE: Set<OrderStage> = new Set(["SHIPPED", "AWAITING_RECEIPT"]);

/** Stages that allow RETURN_IN_PROGRESS. */
const CAN_RETURN: Set<OrderStage> = new Set(["RECEIVED", "COMPLETED"]);

/** Stages that require full payment for PREPAYMENT before entering. */
const REQUIRES_PAYMENT_FOR_PREPAYMENT: Set<OrderStage> = new Set([
  "READY_TO_SHIP",
  "SHIPPED",
  "AWAITING_RECEIPT",
  "RECEIVED",
  "COMPLETED",
]);

type OrderContext = OrderPaymentContext & {
  orderStage?: OrderStage | null;
  paymentType?: PaymentType | null;
  paymentDueDate?: Date | null;
  deliveryMethod?: DeliveryMethod | null;
  hasTtn?: boolean;
};

function resolveCurrentStage(current: OrderStage | null | undefined, fallback: OrderStage): OrderStage {
  if (current && STAGES.includes(current)) return current;
  return fallback;
}

function isPrepayment(ctx: OrderContext): boolean {
  return ctx.paymentType === "PREPAYMENT";
}

/**
 * Validates transition from current stage to toStage using the supplied graph, then business rules.
 */
export function validateOrderStageTransition(
  currentStage: OrderStage | null | undefined,
  toStage: OrderStage,
  ctx: OrderContext,
  allowedTransitions: Record<OrderStage, OrderStage[]>,
): void {
  const from = resolveCurrentStage(currentStage, "NEW");

  if (from === toStage) {
    return;
  }

  assertPaymentTypeForForwardTransition(from, toStage, ctx.paymentType);
  assertNovaPoshtaTtnBeforeConfirmed(toStage, ctx.deliveryMethod, ctx.hasTtn === true);

  const allowed = allowedTransitions[from];
  if (!allowed?.includes(toStage)) {
    throw new BadRequestException(
      `Transition from stage ${from} to ${toStage} is not allowed. Allowed from ${from}: ${allowed?.join(", ") ?? "none"}.`,
    );
  }

  if (toStage === "AWAITING_PAYMENT" && !isPrepayment(ctx)) {
    throw new BadRequestException(
      "Awaiting payment stage is only for prepayment orders. Change payment type to prepayment or use another stage.",
    );
  }

  if (from === "NEW") {
    if (isPrepayment(ctx) && toStage === "AWAITING_STOCK") {
      throw new BadRequestException(
        "Prepayment orders must move to Awaiting payment before awaiting stock.",
      );
    }
    if (!isPrepayment(ctx) && toStage === "AWAITING_PAYMENT") {
      throw new BadRequestException(
        "Awaiting payment is only for prepayment. For deferred payment, move to Awaiting stock.",
      );
    }
  }

  if (toStage === "CANCELED") {
    if (!BEFORE_SHIPPED.has(from)) {
      throw new BadRequestException(
        "Order can only be canceled before it is shipped. Current stage is after shipment.",
      );
    }
    return;
  }

  if (toStage === "REFUSED") {
    if (!CAN_REFUSE.has(from)) {
      throw new BadRequestException(
        "Refusal of delivery is only allowed from Shipped or Awaiting receipt.",
      );
    }
    return;
  }

  if (toStage === "RETURN_IN_PROGRESS") {
    if (!CAN_RETURN.has(from)) {
      throw new BadRequestException(
        "Return can only be started from Received or Completed.",
      );
    }
    return;
  }

  if (toStage === "COMPLETED") {
    assertFinanciallyClosedForCompletion(ctx);
    return;
  }

  if (ctx.paymentType === "PREPAYMENT" && REQUIRES_PAYMENT_FOR_PREPAYMENT.has(toStage)) {
    assertPrepaymentSatisfiedForStage(ctx);
  }
}

export function getAllowedTransitions(
  fromStage: OrderStage | null | undefined,
  allowedTransitions: Record<OrderStage, OrderStage[]>,
): OrderStage[] {
  const from = resolveCurrentStage(fromStage, "NEW");
  return allowedTransitions[from] ?? [];
}
