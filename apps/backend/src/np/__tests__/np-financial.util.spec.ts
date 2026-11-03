import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveNpFinancialFields } from "../np-financial.util";

describe("np-financial.util", () => {
  const settings = { settingsPayerType: "Recipient", settingsPaymentMethod: "Cash" };

  it("uses settings payment and payer when dto is missing", () => {
    const result = resolveNpFinancialFields({
      ...settings,
      settingsPaymentMethod: "NonCash",
    });
    assert.equal(result.paymentMethod, "NonCash");
    assert.equal(result.payerType, "Recipient");
  });

  it("prefers dto payerType over settings", () => {
    const result = resolveNpFinancialFields({
      ...settings,
      dtoPayerType: "Sender",
    });
    assert.equal(result.paymentMethod, "Cash");
    assert.equal(result.payerType, "Sender");
  });

  it("uses settings payment when only dto payerType is set", () => {
    const result = resolveNpFinancialFields({
      ...settings,
      settingsPaymentMethod: "NonCash",
      dtoPayerType: "Recipient",
    });
    assert.equal(result.paymentMethod, "NonCash");
    assert.equal(result.payerType, "Recipient");
  });

  it("prefers explicit dto paymentMethod over settings", () => {
    const result = resolveNpFinancialFields({
      ...settings,
      settingsPaymentMethod: "NonCash",
      dtoPaymentMethod: "Cash",
    });
    assert.equal(result.paymentMethod, "Cash");
  });

  it("falls back to Cash when settings payment is invalid", () => {
    const result = resolveNpFinancialFields({
      settingsPayerType: "Recipient",
      settingsPaymentMethod: "Invalid",
    });
    assert.equal(result.paymentMethod, "Cash");
    assert.equal(result.payerType, "Recipient");
  });
});
