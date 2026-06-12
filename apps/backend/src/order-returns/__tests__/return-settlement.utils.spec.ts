import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { closedReturnNeedsSettlement, findUnsettledClosedReturns } from "../return-settlement.utils";

describe("return-settlement.utils", () => {
  const order = { subtotalAmount: 1000, totalAmount: 1000, paidAmount: 1000 };

  it("flags closed return without settlement when overpayment exists", () => {
    const ret = {
      id: "r1",
      settledAt: null,
      items: [{ qtyReturned: 3, orderItem: { qty: 10, lineTotal: 1000 } }],
    };
    assert.equal(closedReturnNeedsSettlement(ret, order, [ret]), true);
    assert.deepEqual(findUnsettledClosedReturns([ret], order).map((r) => r.id), ["r1"]);
  });

  it("ignores settled return", () => {
    const ret = {
      id: "r1",
      settledAt: new Date(),
      items: [{ qtyReturned: 3, orderItem: { qty: 10, lineTotal: 1000 } }],
    };
    assert.equal(closedReturnNeedsSettlement(ret, order, [ret]), false);
  });

  it("ignores closed return when no overpayment", () => {
    const ret = {
      id: "r1",
      settledAt: null,
      items: [{ qtyReturned: 1, orderItem: { qty: 10, lineTotal: 1000 } }],
    };
    const underpaid = { subtotalAmount: 1000, totalAmount: 1000, paidAmount: 500 };
    assert.equal(closedReturnNeedsSettlement(ret, underpaid, [ret]), false);
  });
});
