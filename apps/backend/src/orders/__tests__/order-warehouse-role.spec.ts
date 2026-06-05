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

test("warehouseAllowedStageTargets returns picking transitions", () => {
  assert.deepEqual(warehouseAllowedStageTargets("CONFIRMED"), ["READY_TO_SHIP"]);
  assert.deepEqual(warehouseAllowedStageTargets("READY_TO_SHIP"), ["CONFIRMED"]);
  assert.deepEqual(warehouseAllowedStageTargets("AWAITING_STOCK"), []);
});

test("assertWarehouseStageTransition allows CONFIRMED ↔ READY_TO_SHIP", () => {
  const actor = warehouseUser();
  assert.doesNotThrow(() =>
    assertWarehouseStageTransition(actor, "CONFIRMED", "READY_TO_SHIP"),
  );
  assert.doesNotThrow(() =>
    assertWarehouseStageTransition(actor, "READY_TO_SHIP", "CONFIRMED"),
  );
});

test("assertWarehouseStageTransition blocks other stage changes", () => {
  const actor = warehouseUser();
  assert.throws(
    () => assertWarehouseStageTransition(actor, "AWAITING_STOCK", "CONFIRMED"),
    /Кладовщик не може/,
  );
  assert.throws(
    () => assertWarehouseStageTransition(actor, "CONFIRMED", "AWAITING_STOCK"),
    /Кладовщик не може/,
  );
  assert.throws(
    () => assertWarehouseStageTransition(actor, "READY_TO_SHIP", "SHIPPED"),
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
