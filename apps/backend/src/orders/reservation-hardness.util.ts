import { OrderStage, ReservationHardness } from "@prisma/client";

const SOFT_RESERVATION_STAGES = new Set<OrderStage>([
  OrderStage.NEW,
  OrderStage.AWAITING_PAYMENT,
]);

/** Map order stage to material reservation hardness for planning availability. */
export function reservationHardnessForStage(stage: OrderStage | null | undefined): ReservationHardness {
  if (stage != null && SOFT_RESERVATION_STAGES.has(stage)) {
    return ReservationHardness.SOFT;
  }
  return ReservationHardness.HARD;
}
