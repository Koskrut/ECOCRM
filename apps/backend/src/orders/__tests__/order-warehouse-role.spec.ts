import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../../auth/auth.types";
import {
  assertWarehouseOrderItemQtyUpdate,
  assertWarehouseOrderMutation,
  assertWarehouseOrderUpdate,
  assertWarehouseSplitByStock,
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
  assert.deepEqual(warehouseAllowedStageTargets("CONFIRMED"), [
    "READY_TO_SHIP",
    "AWAITING_STOCK",
  ]);
  assert.deepEqual(warehouseAllowedStageTargets("READY_TO_SHIP"), ["CONFIRMED"]);
  assert.deepEqual(warehouseAllowedStageTargets("AWAITING_STOCK"), []);
});

test("assertWarehouseStageTransition allows CONFIRMED ↔ READY_TO_SHIP and to AWAITING_STOCK", () => {
  const actor = warehouseUser();
  assert.doesNotThrow(() =>
    assertWarehouseStageTransition(actor, "CONFIRMED", "READY_TO_SHIP"),
  );
  assert.doesNotThrow(() =>
    assertWarehouseStageTransition(actor, "READY_TO_SHIP", "CONFIRMED"),
  );
  assert.doesNotThrow(() =>
    assertWarehouseStageTransition(actor, "CONFIRMED", "AWAITING_STOCK"),
  );
});

test("assertWarehouseStageTransition blocks other stage changes", () => {
  const actor = warehouseUser();
  assert.throws(
    () => assertWarehouseStageTransition(actor, "AWAITING_STOCK", "CONFIRMED"),
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

test("assertWarehouseOrderItemQtyUpdate allows qty on CONFIRMED", () => {
  const actor = warehouseUser();
  assert.doesNotThrow(() =>
    assertWarehouseOrderItemQtyUpdate(actor, "CONFIRMED", { qty: 2 }),
  );
});

test("assertWarehouseOrderItemQtyUpdate blocks price and wrong stage", () => {
  const actor = warehouseUser();
  assert.throws(
    () => assertWarehouseOrderItemQtyUpdate(actor, "CONFIRMED", { price: 100 }),
    /ціну/,
  );
  assert.throws(
    () => assertWarehouseOrderItemQtyUpdate(actor, "CONFIRMED", { discountPercent: 10 }),
    /знижку/,
  );
  assert.throws(
    () => assertWarehouseOrderItemQtyUpdate(actor, "CONFIRMED", { promoType: "BUY_100_GET_30" }),
    /акцію/,
  );
  assert.throws(
    () => assertWarehouseOrderItemQtyUpdate(actor, "READY_TO_SHIP", { qty: 2 }),
    /Підтверджено/,
  );
});

test("assertWarehouseSplitByStock allows only CONFIRMED with picks", () => {
  const actor = warehouseUser();
  assert.doesNotThrow(() => assertWarehouseSplitByStock(actor, "CONFIRMED", true));
  assert.throws(
    () => assertWarehouseSplitByStock(actor, "CONFIRMED", false),
    /збірки/,
  );
  assert.throws(
    () => assertWarehouseSplitByStock(actor, "AWAITING_STOCK", true),
    /Підтверджено/,
  );
});
