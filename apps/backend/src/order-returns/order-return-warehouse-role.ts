import { ForbiddenException } from "@nestjs/common";
import type { ReturnStatus } from "@prisma/client";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";

const WAREHOUSE_ALLOWED_RETURN_STATUSES: ReturnStatus[] = [
  "RECEIVED_BY_WAREHOUSE",
  "INSPECTION",
];

const WAREHOUSE_FORBIDDEN_RETURN_STATUSES: ReturnStatus[] = [
  "REFUND_OR_ADJUSTMENT",
  "CLOSED",
];

export function isWarehouseRole(actor: AuthUser | undefined): boolean {
  return actor?.role === UserRole.WAREHOUSE;
}

export function assertWarehouseReturnStatusUpdate(
  actor: AuthUser | undefined,
  toStatus: ReturnStatus,
): void {
  if (!isWarehouseRole(actor)) return;
  if (WAREHOUSE_FORBIDDEN_RETURN_STATUSES.includes(toStatus)) {
    throw new ForbiddenException("Кладовщик не може закривати повернення або проводити розрахунок");
  }
  if (!WAREHOUSE_ALLOWED_RETURN_STATUSES.includes(toStatus)) {
    throw new ForbiddenException(`Кладовщик не може перевести повернення у статус ${toStatus}`);
  }
}

export function assertWarehouseReturnCreate(actor: AuthUser | undefined): void {
  if (!isWarehouseRole(actor)) return;
  throw new ForbiddenException("Кладовщик не може створювати заявки на повернення");
}

export function assertWarehouseReturnSettlement(actor: AuthUser | undefined): void {
  if (!isWarehouseRole(actor)) return;
  throw new ForbiddenException("Кладовщик не може проводити розрахунок повернення");
}

export function assertWarehousePackageReceive(actor: AuthUser | undefined): void {
  if (!isWarehouseRole(actor)) return;
}

export function assertWarehousePackageItems(actor: AuthUser | undefined): void {
  if (!isWarehouseRole(actor)) return;
}

export function assertManagerPackageCreate(actor: AuthUser | undefined): void {
  if (!actor) return;
  if (actor.role === UserRole.WAREHOUSE) {
    throw new ForbiddenException("Кладовщик не може реєструвати вхідні посилки");
  }
}
