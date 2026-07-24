/**
 * Single source of truth for the default orders pipeline (pre-DB / fallback / tests / migration parity).
 * Keep migration seed data in sync with this file.
 */

import type { OrderStage } from "@prisma/client";

/** Main swimlane column order (OrdersKanban main row). */
export const DEFAULT_MAIN_STAGE_ORDER: OrderStage[] = [
  "NEW",
  "AWAITING_PAYMENT",
  "AWAITING_STOCK",
  "CONFIRMED",
  "READY_TO_SHIP",
  "SHIPPED",
  "AWAITING_RECEIPT",
  "RECEIVED",
];

/** Final drop zones (bottom row while dragging). Order matches UI left-to-right. */
export const DEFAULT_FINAL_STAGE_ORDER: OrderStage[] = [
  "COMPLETED",
  "CANCELED",
  "REFUSED",
  "RETURN_IN_PROGRESS",
  "FULLY_RETURNED",
];

/** Display labels (UA) — same as legacy OrdersKanban STAGE_LABELS + final zone labels. */
export const DEFAULT_STAGE_LABELS: Record<OrderStage, string> = {
  NEW: "Новий",
  CONFIRMED: "Підтверджено",
  AWAITING_PAYMENT: "Очікує оплату",
  AWAITING_STOCK: "Очікує на склад",
  READY_TO_SHIP: "Готово до відправки",
  SHIPPED: "Відправлено",
  AWAITING_RECEIPT: "Очікує отримання",
  RECEIVED: "Отримано",
  COMPLETED: "Завершено",
  CANCELED: "Скасовано",
  REFUSED: "Відмова",
  RETURN_IN_PROGRESS: "Повернення",
  FULLY_RETURNED: "Повернений",
};

/**
 * Optional Tailwind classes for column chrome (final zones had distinct styles).
 * Main columns use default zinc styling in UI when color is null/undefined.
 */
export const DEFAULT_STAGE_COLORS: Record<OrderStage, string | null> = {
  NEW: null,
  CONFIRMED: null,
  AWAITING_PAYMENT: null,
  AWAITING_STOCK: null,
  READY_TO_SHIP: null,
  SHIPPED: null,
  AWAITING_RECEIPT: null,
  RECEIVED: null,
  COMPLETED: "border-emerald-300 bg-emerald-50/80",
  CANCELED: "border-red-300 bg-red-50/80",
  REFUSED: "border-orange-300 bg-orange-50/80",
  RETURN_IN_PROGRESS: "border-amber-300 bg-amber-50/80",
  FULLY_RETURNED: "border-amber-400 bg-amber-50/80",
};

/** Transition graph — same edges as legacy order-stage-transitions ALLOWED_TRANSITIONS. */
export const DEFAULT_ALLOWED_TRANSITIONS: Record<OrderStage, OrderStage[]> = {
  NEW: ["AWAITING_PAYMENT", "AWAITING_STOCK", "CANCELED"],
  AWAITING_PAYMENT: ["AWAITING_STOCK", "NEW", "CANCELED"],
  AWAITING_STOCK: ["CONFIRMED", "NEW", "CANCELED"],
  CONFIRMED: ["READY_TO_SHIP", "AWAITING_STOCK", "CANCELED", "NEW"],
  READY_TO_SHIP: ["SHIPPED", "CONFIRMED", "CANCELED"],
  SHIPPED: ["AWAITING_RECEIPT", "REFUSED"],
  AWAITING_RECEIPT: ["RECEIVED", "REFUSED"],
  RECEIVED: ["COMPLETED", "RETURN_IN_PROGRESS"],
  COMPLETED: ["RETURN_IN_PROGRESS"],
  CANCELED: ["NEW"],
  REFUSED: [],
  RETURN_IN_PROGRESS: [],
  FULLY_RETURNED: [],
};

const ALL_STAGES = [
  ...DEFAULT_MAIN_STAGE_ORDER,
  ...DEFAULT_FINAL_STAGE_ORDER,
] as const;

/** All OrderStage values in canonical order (main row then final zones). */
export const ALL_ORDER_STAGES: OrderStage[] = [...ALL_STAGES];

export function assertDefaultPipelineCoversAllStages(): void {
  const set = new Set<OrderStage>(ALL_STAGES);
  const fromKeys = new Set<OrderStage>(Object.keys(DEFAULT_ALLOWED_TRANSITIONS) as OrderStage[]);
  if (set.size !== 13 || fromKeys.size !== 13) {
    throw new Error("DEFAULT_* pipeline must include every OrderStage exactly once");
  }
  for (const s of fromKeys) {
    if (!set.has(s)) throw new Error(`Missing stage in main/final orders: ${s}`);
  }
}

/** Stable sortOrder: main columns first, then final zones. */
export function defaultSortOrder(stage: OrderStage): number {
  const mi = DEFAULT_MAIN_STAGE_ORDER.indexOf(stage);
  if (mi >= 0) return mi;
  const fi = DEFAULT_FINAL_STAGE_ORDER.indexOf(stage);
  if (fi >= 0) return DEFAULT_MAIN_STAGE_ORDER.length + fi;
  return 999;
}

export function defaultKanbanGroup(stage: OrderStage): "MAIN" | "FINAL" {
  return DEFAULT_FINAL_STAGE_ORDER.includes(stage) ? "FINAL" : "MAIN";
}

export type DefaultPipelineRow = {
  stage: OrderStage;
  sortOrder: number;
  label: string;
  color: string | null;
  kanbanGroup: "MAIN" | "FINAL";
  allowedNext: OrderStage[];
};

/** Rows as inserted by migration / returned on fallback. */
export function buildDefaultPipelineRows(): DefaultPipelineRow[] {
  const stages = [...DEFAULT_MAIN_STAGE_ORDER, ...DEFAULT_FINAL_STAGE_ORDER];
  return stages.map((stage) => ({
    stage,
    sortOrder: defaultSortOrder(stage),
    label: DEFAULT_STAGE_LABELS[stage],
    color: DEFAULT_STAGE_COLORS[stage],
    kanbanGroup: defaultKanbanGroup(stage),
    allowedNext: [...(DEFAULT_ALLOWED_TRANSITIONS[stage] ?? [])],
  }));
}
