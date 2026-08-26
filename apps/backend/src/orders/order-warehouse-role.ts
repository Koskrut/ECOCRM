import { ForbiddenException } from "@nestjs/common";
import type { OrderStage } from "@prisma/client";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";

/** Stages visible in warehouse workspace queue (picking only). */
export const WAREHOUSE_FULFILLMENT_QUEUE_STAGES: OrderStage[] = ["CONFIRMED"];

/** Forward transitions allowed for WAREHOUSE role in workspace (from → to). */
const WAREHOUSE_ALLOWED_TRANSITIONS: Partial<Record<OrderStage, OrderStage[]>> = {
  CONFIRMED: ["READY_TO_SHIP", "AWAITING_STOCK"],
  READY_TO_SHIP: ["CONFIRMED"],
};

/** Step keys shown in warehouse order stepper. */
export const WAREHOUSE_STEPPER_STAGES: OrderStage[] = ["CONFIRMED", "READY_TO_SHIP"];

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

export function assertWarehouseOrderItemQtyUpdate(
  actor: AuthUser | undefined,
  orderStage: OrderStage | null | undefined,
  dto: { qty?: number; price?: number; discountPercent?: number; promoType?: string | null },
): void {
  if (!isWarehouseRole(actor)) return;
  if (dto.price !== undefined) {
    throw new ForbiddenException("Кладовщик не може змінювати ціну позиції");
  }
  if (dto.discountPercent !== undefined) {
    throw new ForbiddenException("Кладовщик не може змінювати знижку позиції");
  }
  if (dto.promoType !== undefined) {
    throw new ForbiddenException("Кладовщик не може змінювати акцію позиції");
  }
  if (dto.qty === undefined) return;
  const stage = orderStage ?? "NEW";
  if (stage !== "CONFIRMED") {
    throw new ForbiddenException(
      "Кладовщик може змінювати кількість лише на стадії Підтверджено",
    );
  }
}

export function assertWarehouseSplitByStock(
  actor: AuthUser | undefined,
  orderStage: OrderStage | null | undefined,
  hasPicks: boolean,
): void {
  if (!isWarehouseRole(actor)) return;
  const stage = orderStage ?? "NEW";
  if (stage !== "CONFIRMED") {
    throw new ForbiddenException(
      "Кладовщик може розділяти замовлення лише на стадії Підтверджено",
    );
  }
  if (!hasPicks) {
    throw new ForbiddenException(
      "Кладовщик може розділяти лише за результатами збірки",
    );
  }
}

export function warehouseAllowedStageTargets(
  fromStage: OrderStage | null | undefined,
): OrderStage[] {
  const from = fromStage ?? "NEW";
  return WAREHOUSE_ALLOWED_TRANSITIONS[from] ?? [];
}
