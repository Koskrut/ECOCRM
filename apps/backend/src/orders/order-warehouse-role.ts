import { ForbiddenException } from "@nestjs/common";
import type { OrderStage } from "@prisma/client";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";

/** Stages visible in warehouse fulfillment queue by default. */
export const WAREHOUSE_FULFILLMENT_QUEUE_STAGES: OrderStage[] = [
  "AWAITING_STOCK",
  "CONFIRMED",
  "READY_TO_SHIP",
];

/** Forward transitions allowed for WAREHOUSE role (from → to). */
const WAREHOUSE_ALLOWED_TRANSITIONS: Partial<Record<OrderStage, OrderStage[]>> = {
  AWAITING_STOCK: ["CONFIRMED"],
  CONFIRMED: ["READY_TO_SHIP"],
  READY_TO_SHIP: ["SHIPPED"],
};

/** Step keys shown in warehouse order stepper (fulfillment chain only). */
export const WAREHOUSE_STEPPER_STAGES: OrderStage[] = [
  "AWAITING_STOCK",
  "CONFIRMED",
  "READY_TO_SHIP",
  "SHIPPED",
];

export function isWarehouseRole(actor: AuthUser | undefined): boolean {
  return actor?.role === UserRole.WAREHOUSE;
}

export function assertWarehouseStageTransition(
  actor: AuthUser | undefined,
  fromStage: OrderStage | null | undefined,
  toStage: OrderStage,
): void {
  if (!isWarehouseRole(actor)) return;
  const from = fromStage ?? "NEW";
  if (from === toStage) return;

  const allowed = WAREHOUSE_ALLOWED_TRANSITIONS[from];
  if (!allowed?.includes(toStage)) {
    throw new ForbiddenException(
      `Кладовщик не може перевести замовлення зі стадії ${from} у ${toStage}`,
    );
  }
}

const WAREHOUSE_ORDER_UPDATE_FIELDS = new Set(["warehouseId"]);

export function assertWarehouseOrderUpdate(
  actor: AuthUser | undefined,
  dto: Record<string, unknown>,
): void {
  if (!isWarehouseRole(actor)) return;
  const keys = Object.keys(dto).filter((k) => dto[k] !== undefined);
  if (keys.length === 0) return;
  for (const key of keys) {
    if (!WAREHOUSE_ORDER_UPDATE_FIELDS.has(key)) {
      throw new ForbiddenException(`Кладовщик не може змінювати поле замовлення: ${key}`);
    }
  }
}

export function assertWarehouseOrderMutation(
  actor: AuthUser | undefined,
  action: string,
): void {
  if (!isWarehouseRole(actor)) return;
  throw new ForbiddenException(`Кладовщик не може виконувати дію: ${action}`);
}

export function warehouseAllowedStageTargets(
  fromStage: OrderStage | null | undefined,
): OrderStage[] {
  const from = fromStage ?? "NEW";
  return WAREHOUSE_ALLOWED_TRANSITIONS[from] ?? [];
}
