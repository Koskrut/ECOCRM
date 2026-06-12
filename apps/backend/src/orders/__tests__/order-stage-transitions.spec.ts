import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { validateOrderStageTransition } from "../order-stage-transitions";

const GRAPH: Record<string, string[]> = {
  RECEIVED: ["COMPLETED", "RETURN_IN_PROGRESS"],
  COMPLETED: ["RETURN_IN_PROGRESS"],
};

describe("validateOrderStageTransition payment gates", () => {
  it("blocks RECEIVED → COMPLETED when debt remains (deferred)", () => {
    assert.throws(
      () =>
        validateOrderStageTransition(
          "RECEIVED",
          "COMPLETED",
          {
            paymentType: "DEFERRED",
            totalAmount: 1000,
            paidAmount: 400,
            debtAmount: 600,
          },
          GRAPH as never,
        ),
      BadRequestException,
    );
  });

  it("allows RECEIVED → COMPLETED when payment is closed", () => {
    assert.doesNotThrow(() =>
      validateOrderStageTransition(
        "RECEIVED",
        "COMPLETED",
        {
          paymentType: "DEFERRED",
          totalAmount: 1000,
          paidAmount: 1000,
          debtAmount: 0,
        },
        GRAPH as never,
      ),
    );
  });

  it("blocks prepayment stage advance using effective total after returns", () => {
    assert.throws(
      () =>
        validateOrderStageTransition(
          "CONFIRMED",
          "READY_TO_SHIP",
          {
            paymentType: "PREPAYMENT",
            totalAmount: 1000,
            returnAdjustmentAmount: 200,
            paidAmount: 700,
            debtAmount: 100,
          },
          { CONFIRMED: ["READY_TO_SHIP"] } as never,
        ),
      BadRequestException,
    );
  });
});
