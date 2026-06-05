import assert from "node:assert/strict";
import test from "node:test";

type OrderStage =
  | "NEW"
  | "CONFIRMED"
  | "AWAITING_STOCK"
  | "READY_TO_SHIP"
  | "SHIPPED";

const LEGACY_STATUS_TO_STAGE: Record<string, OrderStage> = {
  NEW: "NEW",
  IN_WORK: "CONFIRMED",
  READY_TO_SHIP: "READY_TO_SHIP",
  SHIPPED: "SHIPPED",
};

const STAGE_LABELS: Record<OrderStage, string> = {
  NEW: "Новий",
  CONFIRMED: "Підтверджено",
  AWAITING_STOCK: "Очікує на склад",
  READY_TO_SHIP: "Готово до відправки",
  SHIPPED: "Відправлено",
};

function isKnownStage(s: string): s is OrderStage {
  return Object.keys(STAGE_LABELS).includes(s);
}

function resolveStage(o: { orderStage?: string | null; status: string }): OrderStage {
  if (o.orderStage && isKnownStage(o.orderStage)) return o.orderStage;
  const legacy = o.status?.trim();
  if (legacy) {
    const mapped = LEGACY_STATUS_TO_STAGE[legacy];
    if (mapped) return mapped;
    if (isKnownStage(legacy)) return legacy;
  }
  return "NEW";
}

test("legacy IN_WORK without orderStage resolves to CONFIRMED", () => {
  assert.equal(resolveStage({ orderStage: null, status: "IN_WORK" }), "CONFIRMED");
});

test("explicit CONFIRMED orderStage stays CONFIRMED", () => {
  assert.equal(resolveStage({ orderStage: "CONFIRMED", status: "IN_WORK" }), "CONFIRMED");
});
