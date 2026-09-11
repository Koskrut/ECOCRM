import test from "node:test";
import assert from "node:assert/strict";
import { OrderStage } from "@prisma/client";
import {
  crmVelocityQty,
  isVelocityOrderStage,
  VELOCITY_ORDER_STAGES,
} from "../crm-demand-velocity.util";

test("velocity stages exclude soft pipeline and cancels/returns", () => {
  assert.equal(isVelocityOrderStage(OrderStage.NEW), false);
  assert.equal(isVelocityOrderStage(OrderStage.AWAITING_PAYMENT), false);
  assert.equal(isVelocityOrderStage(OrderStage.CANCELED), false);
  assert.equal(isVelocityOrderStage(OrderStage.FULLY_RETURNED), false);
  assert.equal(isVelocityOrderStage(OrderStage.CONFIRMED), true);
  assert.equal(isVelocityOrderStage(OrderStage.AWAITING_STOCK), true);
  assert.equal(isVelocityOrderStage(OrderStage.SHIPPED), true);
  assert.ok(VELOCITY_ORDER_STAGES.includes(OrderStage.COMPLETED));
});

test("crmVelocityQty uses ordered qty floor at zero", () => {
  assert.equal(crmVelocityQty(12), 12);
  assert.equal(crmVelocityQty(-1), 0);
  assert.equal(crmVelocityQty(null), 0);
});
