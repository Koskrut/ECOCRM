import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeOrderOverpayment } from "../balance-holder.utils";

describe("computeOrderOverpayment", () => {
  it("returns positive when paid exceeds effective total", () => {
    assert.equal(
      computeOrderOverpayment({ totalAmount: 1000, returnAdjustmentAmount: 300, paidAmount: 1000 }),
      300,
    );
  });

  it("returns zero when debt remains", () => {
    assert.equal(
      computeOrderOverpayment({ totalAmount: 1000, returnAdjustmentAmount: 0, paidAmount: 400 }),
      0,
    );
  });
});
