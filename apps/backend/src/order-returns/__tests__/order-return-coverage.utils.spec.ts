import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeReturnCoverage } from "../order-return-coverage.utils";

describe("computeReturnCoverage", () => {
  it("returns NONE when nothing returned", () => {
    assert.equal(
      computeReturnCoverage([{ id: "i1", qty: 3 }], []),
      "NONE",
    );
  });

  it("returns PARTIAL when some qty returned", () => {
    assert.equal(
      computeReturnCoverage(
        [
          { id: "i1", qty: 3 },
          { id: "i2", qty: 2 },
        ],
        [{ orderItemId: "i1", qtyReturned: 2 }],
      ),
      "PARTIAL",
    );
  });

  it("returns FULL when every item is fully covered", () => {
    assert.equal(
      computeReturnCoverage(
        [
          { id: "i1", qty: 3 },
          { id: "i2", qty: 2 },
        ],
        [
          { orderItemId: "i1", qtyReturned: 1 },
          { orderItemId: "i1", qtyReturned: 2 },
          { orderItemId: "i2", qtyReturned: 2 },
        ],
      ),
      "FULL",
    );
  });

  it("ignores zero-qty order items", () => {
    assert.equal(
      computeReturnCoverage(
        [
          { id: "i1", qty: 2 },
          { id: "i0", qty: 0 },
        ],
        [{ orderItemId: "i1", qtyReturned: 2 }],
      ),
      "FULL",
    );
  });

  it("is PARTIAL when one of multiple items is not fully returned", () => {
    assert.equal(
      computeReturnCoverage(
        [
          { id: "i1", qty: 3 },
          { id: "i2", qty: 1 },
        ],
        [
          { orderItemId: "i1", qtyReturned: 3 },
          { orderItemId: "i2", qtyReturned: 0 },
        ],
      ),
      "PARTIAL",
    );
  });
});
