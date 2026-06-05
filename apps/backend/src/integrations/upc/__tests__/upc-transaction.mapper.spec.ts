const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  mapUpcTransactionToRaw,
  extractUpcStableDedupKey,
} = require("../upc-transaction.mapper");

describe("upc-transaction.mapper", () => {
  it("maps credit transaction to RawBankTransaction IN", () => {
    const raw = mapUpcTransactionToRaw({
      transactionId: "tx-1",
      bookingDate: "2026-06-01",
      transactionAmount: { amount: "100.50", currency: "UAH" },
      creditDebitIndicator: "CRDT",
      remittanceInformationUnstructured: "ORD-123",
      debtorName: "Client",
    });
    assert.ok(raw);
    assert.strictEqual(raw.direction, "IN");
    assert.strictEqual(raw.amount, 100.5);
    assert.strictEqual(raw.description, "ORD-123");
  });

  it("extractUpcStableDedupKey uses transactionId", () => {
    const tx = mapUpcTransactionToRaw({
      transactionId: "tx-99",
      bookingDate: "2026-06-01",
      transactionAmount: { amount: "10", currency: "UAH" },
      creditDebitIndicator: "CRDT",
    });
    assert.strictEqual(extractUpcStableDedupKey(tx!), "upc:tx-99");
  });
});
