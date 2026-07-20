import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeOrderDebtAndCredit, roundMoney } from "../order-finance.utils";

describe("computeOrderDebtAndCredit", () => {
  it("sets credit after partial return on fully paid order (Oksana case)", () => {
    const r = computeOrderDebtAndCredit({
      totalAmount: 1000,
      returnAdjustmentAmount: 300,
      paidAmount: 1000,
      fxWriteOffAmount: 0,
    });
    assert.equal(r.effectiveTotal, 700);
    assert.equal(r.debtAmount, 0);
    assert.equal(r.creditAmount, 300);
  });

  it("sets debt when underpaid", () => {
    const r = computeOrderDebtAndCredit({
      totalAmount: 1000,
      returnAdjustmentAmount: 0,
      paidAmount: 400,
    });
    assert.equal(r.debtAmount, 600);
    assert.equal(r.creditAmount, 0);
  });

  it("backfill formula matches creditAmount", () => {
    const paidAmount = 1000;
    const totalAmount = 1000;
    const returnAdjustmentAmount = 250;
    const backfill = Math.max(0, paidAmount - Math.max(0, totalAmount - returnAdjustmentAmount));
    const r = computeOrderDebtAndCredit({
      totalAmount,
      returnAdjustmentAmount,
      paidAmount,
    });
    assert.equal(r.creditAmount, backfill);
    assert.equal(backfill, 250);
  });

  it("fx write-off closes residual debt without inventing credit", () => {
    const r = computeOrderDebtAndCredit({
      totalAmount: 100,
      paidAmount: 99,
      fxWriteOffAmount: 1,
    });
    assert.equal(r.debtAmount, 0);
    assert.equal(r.creditAmount, 0);
  });

  it("fx write-off does not inflate credit on overpay", () => {
    const r = computeOrderDebtAndCredit({
      totalAmount: 700,
      paidAmount: 1000,
      fxWriteOffAmount: 50,
    });
    assert.equal(r.creditAmount, 300);
    assert.equal(r.debtAmount, 0);
  });
});

describe("roundMoney", () => {
  it("rounds to cents", () => {
    assert.equal(roundMoney(1.006), 1.01);
    assert.equal(roundMoney(1.004), 1);
  });
});
