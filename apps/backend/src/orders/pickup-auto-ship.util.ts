import type { Prisma } from "@prisma/client";

/**
 * Pickup orders stuck at READY_TO_SHIP — auto-moved to SHIPPED overnight
 * so managers do not have to flip the stage after issue/handover.
 */
export const PICKUP_AUTO_SHIP_WHERE: Prisma.OrderWhereInput = {
  deliveryMethod: "PICKUP",
  orderStage: "READY_TO_SHIP",
};

export const PICKUP_AUTO_SHIP_REASON = "Авто: самовивіз (нічний перехід у Відправлено)";
