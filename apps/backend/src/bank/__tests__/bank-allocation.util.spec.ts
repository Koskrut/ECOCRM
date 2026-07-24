const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  sumBankTransactionAllocations,
  allocationExceedsTransaction,
  remainingBankTransactionAmount,
  bankTransactionNeedsAllocation,
} = require("../bank-allocation.util");

describe("bank-allocation.util", () => {
  it("sums completed payment amounts", () => {
    const total = sumBankTransactionAllocations([
      { amount: 100, status: "COMPLETED" },
      { amount: 50, status: "COMPLETED" },
      { amount: 999, status: "VOID" },
    ]);
    assert.strictEqual(total, 150);
  });

  it("rejects allocation that exceeds transaction amount", () => {
    assert.strictEqual(allocationExceedsTransaction(5824, 5824, 5824), true);
    assert.strictEqual(allocationExceedsTransaction(0, 5824, 5824), false);
    assert.strictEqual(allocationExceedsTransaction(3000, 2824, 5824), false);
    assert.strictEqual(allocationExceedsTransaction(3000, 2825, 5824), true);
  });

  it("computes residual remaining amount", () => {
    const payments = [{ amount: 300, status: "COMPLETED" }];
    assert.strictEqual(remainingBankTransactionAmount(1000, payments), 700);
    assert.strictEqual(bankTransactionNeedsAllocation(1000, payments), true);
    assert.strictEqual(
      bankTransactionNeedsAllocation(1000, [{ amount: 1000, status: "COMPLETED" }]),
      false,
    );
  });
});
