import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../../auth/auth.types";
import {
  assertWarehouseOrderMutation,
  assertWarehouseOrderUpdate,
  assertWarehouseStageTransition,
  warehouseAllowedStageTargets,
} from "../order-warehouse-role";

function warehouseUser(): AuthUser {
  return {
    id: "wh1",
    email: "wh@test",
    fullName: "Warehouse",
    role: UserRole.WAREHOUSE,
  };
}

test("warehouseAllowedStageTargets returns forward fulfillment steps", () => {
  assert.deepEqual(warehouseAllowedStageTargets("AWAITING_STOCK"), ["CONFIRMED"]);
  assert.deepEqual(warehouseAllowedStageTargets("CONFIRMED"), ["READY_TO_SHIP"]);
  assert.deepEqual(warehouseAllowedStageTargets("READY_TO_SHIP"), ["SHIPPED"]);
});

test("assertWarehouseStageTransition allows fulfillment chain", () => {
  const actor = warehouseUser();
  assert.doesNotThrow(() =>
    assertWarehouseStageTransition(actor, "AWAITING_STOCK", "CONFIRMED"),
  );
  assert.doesNotThrow(() =>
    assertWarehouseStageTransition(actor, "CONFIRMED", "READY_TO_SHIP"),
  );
  assert.doesNotThrow(() =>
    assertWarehouseStageTransition(actor, "READY_TO_SHIP", "SHIPPED"),
  );
});

test("assertWarehouseStageTransition blocks cancel and backward jumps", () => {
  const actor = warehouseUser();
  assert.throws(
    () => assertWarehouseStageTransition(actor, "CONFIRMED", "AWAITING_STOCK"),
    /Кладовщик не може/,
  );
  assert.throws(
    () => assertWarehouseStageTransition(actor, "READY_TO_SHIP", "CANCELED"),
    /Кладовщик не може/,
  );
});

test("assertWarehouseOrderUpdate allows only warehouseId", () => {
  const actor = warehouseUser();
  assert.doesNotThrow(() =>
    assertWarehouseOrderUpdate(actor, { warehouseId: "wh-dnipro" }),
  );
  assert.throws(
    () => assertWarehouseOrderUpdate(actor, { paidAmount: 100 }),
    /Кладовщик не може/,
  );
});

test("assertWarehouseOrderMutation blocks create order", () => {
  assert.throws(
    () => assertWarehouseOrderMutation(warehouseUser(), "create order"),
    /Кладовщик не може/,
  );
});
