import { ForbiddenException } from "@nestjs/common";
import type { OrderStage } from "@prisma/client";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";

/** Stages after «Підтверджено» that ordinary managers may not set. */
export const PAST_CONFIRMED_STAGES: ReadonlySet<OrderStage> = new Set([
  "READY_TO_SHIP",
  "SHIPPED",
  "AWAITING_RECEIPT",
  "RECEIVED",
  "COMPLETED",
  "REFUSED",
  "RETURN_IN_PROGRESS",
  "FULLY_RETURNED",
]);

export function isPastConfirmedStage(stage: OrderStage | string | null | undefined): boolean {
  if (!stage) return false;
  return PAST_CONFIRMED_STAGES.has(stage as OrderStage);
}

export function managerCanAdvancePastConfirmed(opts: {
  actorId: string;
  ownerId: string | null | undefined;
  warehouseResponsibleUserId: string | null | undefined;
}): boolean {
  const { actorId, ownerId, warehouseResponsibleUserId } = opts;
  if (!actorId) return false;
  if (!ownerId || ownerId !== actorId) return false;
  if (!warehouseResponsibleUserId || warehouseResponsibleUserId !== actorId) return false;
  return true;
}

/**
 * Cap MANAGER stage moves past CONFIRMED unless they own the order and are
 * the responsible user of the order's warehouse.
 */
export function assertManagerStageCap(
  actor: AuthUser | undefined,
  order: {
    ownerId: string | null | undefined;
    warehouseResponsibleUserId: string | null | undefined;
  },
  _fromStage: OrderStage | null | undefined,
  toStage: OrderStage,
): void {
  if (!actor || actor.role !== UserRole.MANAGER) return;
  if (!isPastConfirmedStage(toStage)) return;
  if (
    managerCanAdvancePastConfirmed({
      actorId: actor.id,
      ownerId: order.ownerId,
      warehouseResponsibleUserId: order.warehouseResponsibleUserId,
    })
  ) {
    return;
  }
  throw new ForbiddenException(
    "Менеджер не може перевести замовлення далі етапу «Підтверджено». Далі працює склад.",
  );
}
