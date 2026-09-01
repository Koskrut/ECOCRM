export type OrderStage =
  | "NEW"
  | "CONFIRMED"
  | "AWAITING_PAYMENT"
  | "AWAITING_STOCK"
  | "READY_TO_SHIP"
  | "SHIPPED"
  | "AWAITING_RECEIPT"
  | "RECEIVED"
  | "COMPLETED"
  | "CANCELED"
  | "REFUSED"
  | "RETURN_IN_PROGRESS"
  | "FULLY_RETURNED";

export const FALLBACK_MAIN_STAGE_ORDER: OrderStage[] = [
  "NEW",
  "AWAITING_PAYMENT",
  "AWAITING_STOCK",
  "CONFIRMED",
  "READY_TO_SHIP",
  "SHIPPED",
  "AWAITING_RECEIPT",
  "RECEIVED",
];

export const FALLBACK_FINAL_STAGE_ORDER: OrderStage[] = [
  "COMPLETED",
  "CANCELED",
  "REFUSED",
  "RETURN_IN_PROGRESS",
  "FULLY_RETURNED",
];

export const STAGE_LABELS: Record<OrderStage, string> = {
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

export const FALLBACK_FINAL_DROP_ZONES: { id: OrderStage; label: string; className: string }[] = [
  { id: "COMPLETED", label: STAGE_LABELS.COMPLETED, className: "border-emerald-300 bg-emerald-50/80" },
  { id: "CANCELED", label: STAGE_LABELS.CANCELED, className: "border-red-300 bg-red-50/80" },
  { id: "REFUSED", label: STAGE_LABELS.REFUSED, className: "border-orange-300 bg-orange-50/80" },
  { id: "RETURN_IN_PROGRESS", label: STAGE_LABELS.RETURN_IN_PROGRESS, className: "border-amber-300 bg-amber-50/80" },
  { id: "FULLY_RETURNED", label: STAGE_LABELS.FULLY_RETURNED, className: "border-amber-400 bg-amber-50/80" },
];

/** Mirrors backend order-pipeline.defaults DEFAULT_ALLOWED_TRANSITIONS. */
export const FALLBACK_ALLOWED_TRANSITIONS: Record<OrderStage, OrderStage[]> = {
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

/** Mirrors backend order-warehouse-role WAREHOUSE_ALLOWED_TRANSITIONS. */
export const WAREHOUSE_ALLOWED_TRANSITIONS: Partial<Record<OrderStage, OrderStage[]>> = {
  CONFIRMED: ["READY_TO_SHIP", "AWAITING_STOCK"],
  READY_TO_SHIP: ["CONFIRMED"],
};

export const WAREHOUSE_KANBAN_STAGES: OrderStage[] = [
  "AWAITING_STOCK",
  "CONFIRMED",
  "READY_TO_SHIP",
];

const LEGACY_STATUS_TO_STAGE: Record<string, OrderStage> = {
  NEW: "NEW",
  IN_WORK: "CONFIRMED",
  READY_TO_SHIP: "READY_TO_SHIP",
  SHIPPED: "SHIPPED",
  CONTROL_PAYMENT: "RECEIVED",
  SUCCESS: "COMPLETED",
  RETURNING: "RETURN_IN_PROGRESS",
  CANCELED: "CANCELED",
};

export function isKnownStage(s: string): s is OrderStage {
  return Object.prototype.hasOwnProperty.call(STAGE_LABELS, s);
}

export function isFinalOrderStage(stage: OrderStage): boolean {
  return FALLBACK_FINAL_STAGE_ORDER.includes(stage);
}

export function resolveStage(o: { orderStage?: string | null; status?: string | null }): OrderStage {
  if (o.orderStage && isKnownStage(o.orderStage)) return o.orderStage;
  const legacy = o.status?.trim();
  if (legacy) {
    const mapped = LEGACY_STATUS_TO_STAGE[legacy];
    if (mapped) return mapped;
    if (isKnownStage(legacy)) return legacy;
  }
  return "NEW";
}

/** Mirrors backend order-stage-prerequisites isForwardStageTransition. */
export function isForwardStageTransition(from: OrderStage, to: OrderStage): boolean {
  if (from === to) return false;
  if (to === "CANCELED") return false;
  const fromIdx = FALLBACK_MAIN_STAGE_ORDER.indexOf(from);
  const toIdx = FALLBACK_MAIN_STAGE_ORDER.indexOf(to);
  if (fromIdx >= 0 && toIdx >= 0) return toIdx > fromIdx;
  return to === "COMPLETED";
}

export type KanbanDropBlockCode =
  | "not_allowed"
  | "payment_type"
  | "awaiting_payment_prepay"
  | "prepay_must_await_payment"
  | "deferred_no_awaiting_payment"
  | "complete_debt";

export function allowedNextForStage(
  from: OrderStage,
  pipelineAllowedNext: OrderStage[] | undefined,
  warehouseRestricted: boolean,
): OrderStage[] {
  const graph = pipelineAllowedNext ?? FALLBACK_ALLOWED_TRANSITIONS[from] ?? [];
  if (!warehouseRestricted) return graph;
  const warehouse = WAREHOUSE_ALLOWED_TRANSITIONS[from] ?? [];
  return warehouse.filter((stage) => graph.includes(stage));
}

export function getKanbanDropBlock(opts: {
  from: OrderStage;
  to: OrderStage;
  paymentType?: string | null;
  debtAmount?: number | null;
  allowedNext: OrderStage[];
}): KanbanDropBlockCode | null {
  const { from, to, paymentType, debtAmount, allowedNext } = opts;
  if (from === to) return null;
  if (!allowedNext.includes(to)) return "not_allowed";

  if (isForwardStageTransition(from, to) && !paymentType) return "payment_type";

  if (from === "NEW" && paymentType === "PREPAYMENT" && to === "AWAITING_STOCK") {
    return "prepay_must_await_payment";
  }
  if (from === "NEW" && paymentType !== "PREPAYMENT" && to === "AWAITING_PAYMENT") {
    return "deferred_no_awaiting_payment";
  }
  if (to === "AWAITING_PAYMENT" && paymentType !== "PREPAYMENT") {
    return "awaiting_payment_prepay";
  }
  if (to === "COMPLETED" && Number(debtAmount ?? 0) > 0.009) {
    return "complete_debt";
  }
  return null;
}
