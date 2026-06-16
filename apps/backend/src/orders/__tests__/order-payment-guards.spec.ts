import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import {
  assertPaymentClosedForCompletion,
  computeEffectiveDebt,
  isPaymentClosed,
} from "../order-payment-guards";

describe("order-payment-guards", () => {
  it("computeEffectiveDebt uses return adjustment", () => {
    assert.equal(
      computeEffectiveDebt({
        totalAmount: 1000,
        returnAdjustmentAmount: 200,
        paidAmount: 600,
        debtAmount: null,
      }),
      200,
    );
  });

  it("computeEffectiveDebt subtracts fx write-off", () => {
    assert.equal(
      computeEffectiveDebt({
        totalAmount: 100,
        paidAmount: 99,
        fxWriteOffAmount: 1,
        debtAmount: null,
      }),
      0,
    );
  });

  it("prefers persisted debtAmount", () => {
    assert.equal(
      computeEffectiveDebt({
        totalAmount: 1000,
        paidAmount: 0,
        debtAmount: 50,
      }),
      50,
    );
  });

  it("isPaymentClosed when debt is zero", () => {
    assert.equal(isPaymentClosed({ debtAmount: 0 }), true);
    assert.equal(isPaymentClosed({ totalAmount: 100, paidAmount: 100 }), true);
  });

  it("assertPaymentClosedForCompletion rejects open debt", () => {
    assert.throws(
      () => assertPaymentClosedForCompletion({ debtAmount: 10 }),
      BadRequestException,
    );
  });
});
