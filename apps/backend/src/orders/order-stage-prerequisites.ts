import { BadRequestException } from "@nestjs/common";
import type { DeliveryMethod, OrderStage, PaymentType } from "@prisma/client";
import { DEFAULT_MAIN_STAGE_ORDER } from "./pipeline/order-pipeline.defaults";

/** True when target stage is ahead of the current stage on the main swimlane. */
export function isForwardStageTransition(from: OrderStage, to: OrderStage): boolean {
  if (from === to) return false;
  if (to === "CANCELED") return false;

  const fromIdx = DEFAULT_MAIN_STAGE_ORDER.indexOf(from);
  const toIdx = DEFAULT_MAIN_STAGE_ORDER.indexOf(to);
  if (fromIdx >= 0 && toIdx >= 0) return toIdx > fromIdx;

  return to === "COMPLETED";
}

export function orderHasTtnRecord(opts: {
  deliveryData?: unknown;
  hasOrderTtn: boolean;
  hasShipmentTtn: boolean;
}): boolean {
  if (opts.hasOrderTtn || opts.hasShipmentTtn) return true;

  const dd = opts.deliveryData as { novaPoshta?: { ttn?: { number?: unknown } } } | null;
  const num = dd?.novaPoshta?.ttn?.number;
  return !!(num && String(num).trim());
}

export function assertPaymentTypeForForwardTransition(
  from: OrderStage,
  to: OrderStage,
  paymentType: PaymentType | null | undefined,
): void {
  if (!isForwardStageTransition(from, to)) return;
  if (paymentType) return;

  throw new BadRequestException(
    "Cannot change order stage: payment terms must be set before moving to the next stage.",
  );
}

export function assertNovaPoshtaTtnBeforeConfirmed(
  toStage: OrderStage,
  deliveryMethod: DeliveryMethod | null | undefined,
  hasTtn: boolean,
): void {
  if (toStage !== "CONFIRMED") return;
  if (deliveryMethod !== "NOVA_POSHTA") return;
  if (hasTtn) return;

  throw new BadRequestException(
    "Cannot confirm order: Nova Poshta delivery requires a TTN before moving to Confirmed.",
  );
}

/** UI and most reads treat null/undefined orderStage as NEW. */
export function isNewOrderStage(orderStage: OrderStage | null | undefined): boolean {
  return orderStage == null || orderStage === "NEW";
}

/**
 * Leaving NEW (including null stage) requires contact Код 1С.
 * Shared by setOrderStage and TTN persist so the rule cannot be bypassed.
 */
export function assertContactExternalCodeToLeaveNew(
  fromStage: OrderStage | null | undefined,
  toStage: OrderStage | null | undefined,
  contactExternalCode: string | null | undefined,
): void {
  if (!isNewOrderStage(fromStage)) return;
  if (toStage != null && isNewOrderStage(toStage)) return;

  const code = contactExternalCode?.trim();
  if (code) return;

  throw new BadRequestException(
    "Cannot change stage from NEW: contact must have externalCode (Код1с)",
  );
}
