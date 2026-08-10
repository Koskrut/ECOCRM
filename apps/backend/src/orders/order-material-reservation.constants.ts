import { OrderStage } from "@prisma/client";

/** Stages that keep ACTIVE material reservations (qty still reserved in catalog). */
export const STAGES_WITH_ACTIVE_RESERVATION = new Set<OrderStage>([
  OrderStage.NEW,
  OrderStage.CONFIRMED,
  OrderStage.AWAITING_PAYMENT,
  OrderStage.AWAITING_STOCK,
  OrderStage.READY_TO_SHIP,
]);

/** Cancel / return path — release stock back to available. */
export const STAGES_RELEASE_RESERVATION = new Set<OrderStage>([
  OrderStage.CANCELED,
  OrderStage.REFUSED,
  OrderStage.RETURN_IN_PROGRESS,
  OrderStage.FULLY_RETURNED,
]);

/** Shipped / closed path — consume reservation (left the warehouse). */
export const STAGES_CONSUME_RESERVATION = new Set<OrderStage>([
  OrderStage.SHIPPED,
  OrderStage.AWAITING_RECEIPT,
  OrderStage.RECEIVED,
  OrderStage.COMPLETED,
]);
