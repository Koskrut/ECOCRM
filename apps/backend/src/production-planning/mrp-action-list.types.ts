import { PlanningRunLineType } from "@prisma/client";

export type ActionListPriority = "CRITICAL" | "HARD" | "FORECAST" | "NORMAL";

export type ActionListItem = {
  lineId: string;
  productId: string;
  sku: string;
  name: string;
  qty: number;
  desiredDate: string;
  reason: string;
  priority: ActionListPriority;
  lineType: PlanningRunLineType;
  monthOffset?: number;
  canCreateBatch?: boolean;
  blockers?: string[];
  /** Pack need (forecast + pipeline), for packaging tab. */
  packNeed?: number;
  /** Max kits buildable from inventoried BOM parts now. */
  maxFromParts?: number;
  bottleneckSku?: string | null;
};

export const ACTION_PRIORITY_ORDER: Record<ActionListPriority, number> = {
  CRITICAL: 0,
  HARD: 1,
  FORECAST: 2,
  NORMAL: 3,
};
