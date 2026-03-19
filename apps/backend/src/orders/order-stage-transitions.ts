/**
 * Phase 2: Allowed orderStage transitions and business validations.
 * Single source of truth for "can we go from A to B?" and prepayment/deferred rules.
 */

import type { OrderStage, PaymentType } from "@prisma/client";
import { BadRequestException } from "@nestjs/common";

const STAGES: OrderStage[] = [
  "NEW",
  "CONFIRMED",
  "AWAITING_PAYMENT",
  "AWAITING_STOCK",
  "READY_TO_SHIP",
  "SHIPPED",
  "AWAITING_RECEIPT",
  "RECEIVED",
  "COMPLETED",
  "CANCELED",
  "REFUSED",
  "RETURN_IN_PROGRESS",
];

/** Normal flow + reasonable direct skips. Terminal stages cannot be left. Back to NEW allowed from pre-shipment only. */
const ALLOWED_TRANSITIONS: Record<OrderStage, OrderStage[]> = {
  NEW: ["CONFIRMED", "CANCELED"],
  CONFIRMED: ["AWAITING_PAYMENT", "AWAITING_STOCK", "READY_TO_SHIP", "CANCELED", "NEW"],
  AWAITING_PAYMENT: ["READY_TO_SHIP", "CONFIRMED", "CANCELED", "NEW"],
  AWAITING_STOCK: ["READY_TO_SHIP", "CONFIRMED", "CANCELED", "NEW"],
  READY_TO_SHIP: ["SHIPPED", "CONFIRMED", "CANCELED"],
  SHIPPED: ["AWAITING_RECEIPT", "REFUSED"],
  AWAITING_RECEIPT: ["RECEIVED", "REFUSED"],
  RECEIVED: ["COMPLETED", "RETURN_IN_PROGRESS"],
  COMPLETED: ["RETURN_IN_PROGRESS"],
  CANCELED: ["NEW"],
  REFUSED: [],
  RETURN_IN_PROGRESS: [],
};

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

type OrderContext = {
  orderStage?: OrderStage | null;
  paymentType?: PaymentType | null;
  paidAmount?: number;
  totalAmount?: number;
  debtAmount?: number;
};

function resolveCurrentStage(current: OrderStage | null | undefined, fallback: OrderStage): OrderStage {
  if (current && STAGES.includes(current)) return current;
  return fallback;
}

/**
 * Validates transition from current stage to toStage and business rules.
 * Throws BadRequestException with a message if not allowed.
 */
export function validateOrderStageTransition(
  currentStage: OrderStage | null | undefined,
  toStage: OrderStage,
  ctx: OrderContext,
): void {
  const from = resolveCurrentStage(currentStage, "NEW");

  if (from === toStage) {
    return; // no-op allowed
  }

  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed?.includes(toStage)) {
    throw new BadRequestException(
      `Transition from stage ${from} to ${toStage} is not allowed. Allowed from ${from}: ${allowed?.join(", ") ?? "none"}.`,
    );
  }

  // CANCELED: only before SHIPPED
  if (toStage === "CANCELED") {
    if (!BEFORE_SHIPPED.has(from)) {
      throw new BadRequestException(
        "Order can only be canceled before it is shipped. Current stage is after shipment.",
      );
    }
    return;
  }

  // REFUSED: only from SHIPPED or AWAITING_RECEIPT
  if (toStage === "REFUSED") {
    if (!CAN_REFUSE.has(from)) {
      throw new BadRequestException(
        "Refusal of delivery is only allowed from Shipped or Awaiting receipt.",
      );
    }
    return;
  }

  // RETURN_IN_PROGRESS: only after RECEIVED or from COMPLETED
  if (toStage === "RETURN_IN_PROGRESS") {
    if (!CAN_RETURN.has(from)) {
      throw new BadRequestException(
        "Return can only be started from Received or Completed.",
      );
    }
    return;
  }

  // PREPAYMENT: cannot enter shipping/received/completed without full payment
  if (ctx.paymentType === "PREPAYMENT" && REQUIRES_PAYMENT_FOR_PREPAYMENT.has(toStage)) {
    const total = Number(ctx.totalAmount ?? 0);
    const paid = Number(ctx.paidAmount ?? 0);
    if (total > 0.00001 && paid < total - 0.00001) {
      throw new BadRequestException(
        "Prepayment order must be fully paid before moving to this stage. Pay the order first.",
      );
    }
  }
}

export function getAllowedTransitions(fromStage: OrderStage | null | undefined): OrderStage[] {
  const from = resolveCurrentStage(fromStage, "NEW");
  return ALLOWED_TRANSITIONS[from] ?? [];
}
