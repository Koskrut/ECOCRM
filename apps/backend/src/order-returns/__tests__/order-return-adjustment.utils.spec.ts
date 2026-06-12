import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeReturnAdjustmentAmount } from "../order-return-adjustment.utils";

describe("computeReturnAdjustmentAmount", () => {
  it("uses proportional lineTotal without discount", () => {
    const amount = computeReturnAdjustmentAmount(
      [
        {
          items: [{ qtyReturned: 2, orderItem: { qty: 4, lineTotal: 400 } }],
        },
      ],
      { subtotalAmount: 1000, totalAmount: 1000 },
    );
    assert.equal(amount, 200);
  });

  it("applies order-level discount ratio", () => {
    const amount = computeReturnAdjustmentAmount(
      [
        {
          items: [{ qtyReturned: 5, orderItem: { qty: 10, lineTotal: 1000 } }],
        },
      ],
      { subtotalAmount: 1000, totalAmount: 900 },
    );
    assert.equal(amount, 450);
  });

  it("sums multiple closed returns", () => {
    const amount = computeReturnAdjustmentAmount(
      [
        { items: [{ qtyReturned: 1, orderItem: { qty: 2, lineTotal: 200 } }] },
        { items: [{ qtyReturned: 3, orderItem: { qty: 6, lineTotal: 600 } }] },
      ],
      { subtotalAmount: 800, totalAmount: 800 },
    );
    assert.equal(amount, 400);
  });
});
