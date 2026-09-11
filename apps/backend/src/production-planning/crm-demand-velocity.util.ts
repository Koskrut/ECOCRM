import { OrderStage } from "@prisma/client";

/**
 * Stages that count as accepted historical demand for velocity / ABC.
 * Soft pipeline (NEW, AWAITING_PAYMENT) stays in hard/soft backlog, not sales history.
 * Terminal cancels / returns are excluded so they do not inflate averages.
 */
export const VELOCITY_ORDER_STAGES: readonly OrderStage[] = [
  OrderStage.CONFIRMED,
  OrderStage.AWAITING_STOCK,
  OrderStage.READY_TO_SHIP,
  OrderStage.SHIPPED,
  OrderStage.AWAITING_RECEIPT,
  OrderStage.RECEIVED,
  OrderStage.COMPLETED,
] as const;

export const VELOCITY_ORDER_STAGE_SET = new Set<OrderStage>(VELOCITY_ORDER_STAGES);

/** Qty that feeds historical velocity — ordered qty, never qtyShipped (avoids stockout starvation). */
export function crmVelocityQty(qty: number | null | undefined): number {
  if (qty == null || !Number.isFinite(qty)) return 0;
  return Math.max(0, qty);
}

export function isVelocityOrderStage(stage: OrderStage | null | undefined): boolean {
  if (!stage) return false;
  return VELOCITY_ORDER_STAGE_SET.has(stage);
}
