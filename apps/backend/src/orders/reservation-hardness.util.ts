import { OrderStage, ReservationHardness } from "@prisma/client";

export type ReservationHardnessRules = {
  softStages: OrderStage[];
};

export const DEFAULT_SOFT_STAGES = new Set<OrderStage>([
  OrderStage.NEW,
  OrderStage.AWAITING_PAYMENT,
]);

/** Map order stage to material reservation hardness using demand rules (or defaults). */
export function reservationHardnessForStage(
  stage: OrderStage | null | undefined,
  rules?: ReservationHardnessRules | null,
): ReservationHardness {
  const softSet = rules?.softStages?.length
    ? new Set<OrderStage>(rules.softStages)
    : DEFAULT_SOFT_STAGES;
  if (stage != null && softSet.has(stage)) {
    return ReservationHardness.SOFT;
  }
  return ReservationHardness.HARD;
}
