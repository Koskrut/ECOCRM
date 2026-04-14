import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeAuditDiff } from "../audit-diff";

describe("computeAuditDiff", () => {
  it("returns changed nested fields", () => {
    const diff = computeAuditDiff(
      { status: "NEW", pricing: { qty: 1, amount: 10 } },
      { status: "SHIPPED", pricing: { qty: 2, amount: 10 } },
    );
    assert.equal(diff.length, 2);
    assert.deepEqual(
      diff.map((entry) => entry.field).sort(),
      ["pricing.qty", "status"],
    );
  });
});
