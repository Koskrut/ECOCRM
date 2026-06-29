import type { ListOrdersQuery } from "@/lib/api/orders";
import { MAIN_STAGE_ORDER, SPECIAL_STAGES } from "@/lib/order-stage";

export type OrderStagePreset = "all" | (typeof MAIN_STAGE_ORDER)[number] | (typeof SPECIAL_STAGES)[number];

/** Kanban column order: main swimlane, then final zones. */
export const ORDER_KANBAN_PRESETS: OrderStagePreset[] = [
  "all",
  ...MAIN_STAGE_ORDER,
  ...SPECIAL_STAGES,
];

export function buildMyOrdersListQuery(
  userId: string | null | undefined,
  stagePreset: OrderStagePreset,
): Pick<ListOrdersQuery, "ownerId" | "orderStage"> {
  const query: Pick<ListOrdersQuery, "ownerId" | "orderStage"> = {};
  if (userId) query.ownerId = userId;
  if (stagePreset !== "all") query.orderStage = stagePreset;
  return query;
}
