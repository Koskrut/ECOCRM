import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import {
  assertNovaPoshtaTtnBeforeConfirmed,
  assertPaymentTypeForForwardTransition,
  isForwardStageTransition,
  orderHasTtnRecord,
} from "../order-stage-prerequisites";
import { validateOrderStageTransition } from "../order-stage-transitions";

const GRAPH = {
  AWAITING_STOCK: ["CONFIRMED", "CANCELED"],
  NEW: ["AWAITING_STOCK", "CANCELED"],
} as const;

describe("order-stage-prerequisites", () => {
  it("detects forward transitions on the main swimlane", () => {
    assert.equal(isForwardStageTransition("NEW", "AWAITING_STOCK"), true);
    assert.equal(isForwardStageTransition("AWAITING_STOCK", "CONFIRMED"), true);
    assert.equal(isForwardStageTransition("CONFIRMED", "AWAITING_STOCK"), false);
    assert.equal(isForwardStageTransition("NEW", "CANCELED"), false);
  });

  it("blocks forward transition without payment terms", () => {
    assert.throws(
      () => assertPaymentTypeForForwardTransition("NEW", "AWAITING_STOCK", null),
      BadRequestException,
    );
    assert.doesNotThrow(() =>
      assertPaymentTypeForForwardTransition("CONFIRMED", "AWAITING_STOCK", null),
    );
    assert.doesNotThrow(() =>
      assertPaymentTypeForForwardTransition("NEW", "CANCELED", null),
    );
  });

  it("blocks CONFIRMED for Nova Poshta without TTN", () => {
    assert.throws(
      () => assertNovaPoshtaTtnBeforeConfirmed("CONFIRMED", "NOVA_POSHTA", false),
      BadRequestException,
    );
    assert.doesNotThrow(() =>
      assertNovaPoshtaTtnBeforeConfirmed("CONFIRMED", "PICKUP", false),
    );
    assert.doesNotThrow(() =>
      assertNovaPoshtaTtnBeforeConfirmed("CONFIRMED", "NOVA_POSHTA", true),
    );
  });

  it("detects TTN from deliveryData snapshot", () => {
    assert.equal(
      orderHasTtnRecord({
        deliveryData: { novaPoshta: { ttn: { number: "20450123456789" } } },
        hasOrderTtn: false,
        hasShipmentTtn: false,
      }),
      true,
    );
    assert.equal(
      orderHasTtnRecord({
        deliveryData: null,
        hasOrderTtn: false,
        hasShipmentTtn: true,
      }),
      true,
    );
  });

  it("integrates payment and TTN gates in validateOrderStageTransition", () => {
    assert.throws(
      () =>
        validateOrderStageTransition(
          "NEW",
          "AWAITING_STOCK",
          { paymentType: null },
          GRAPH as never,
        ),
      BadRequestException,
    );

    assert.throws(
      () =>
        validateOrderStageTransition(
          "AWAITING_STOCK",
          "CONFIRMED",
          {
            paymentType: "DEFERRED",
            deliveryMethod: "NOVA_POSHTA",
            hasTtn: false,
          },
          GRAPH as never,
        ),
      BadRequestException,
    );

    assert.doesNotThrow(() =>
      validateOrderStageTransition(
        "AWAITING_STOCK",
        "CONFIRMED",
        {
          paymentType: "DEFERRED",
          deliveryMethod: "NOVA_POSHTA",
          hasTtn: true,
        },
        GRAPH as never,
      ),
    );
  });
});
