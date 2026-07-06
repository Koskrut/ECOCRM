import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveNpFinancialFields } from "../np-financial.util";

describe("np-financial.util", () => {
  const settings = { settingsPayerType: "Recipient", settingsPaymentMethod: "Cash" };

  it("maps FOP order payment to NonCash with settings payer", () => {
    const result = resolveNpFinancialFields({
      ...settings,
      orderPaymentMethod: "FOP",
    });
    assert.equal(result.paymentMethod, "NonCash");
    assert.equal(result.payerType, "Recipient");
  });

  it("maps CASH order payment to Cash with settings payer", () => {
    const result = resolveNpFinancialFields({
      ...settings,
      orderPaymentMethod: "CASH",
    });
    assert.equal(result.paymentMethod, "Cash");
    assert.equal(result.payerType, "Recipient");
  });

  it("prefers dto payerType and order FOP for payment", () => {
    const result = resolveNpFinancialFields({
      ...settings,
      dtoPayerType: "Sender",
      orderPaymentMethod: "FOP",
    });
    assert.equal(result.paymentMethod, "NonCash");
    assert.equal(result.payerType, "Sender");
  });

  it("uses dto payerType and settings payment when order payment is missing", () => {
    const result = resolveNpFinancialFields({
      ...settings,
      settingsPaymentMethod: "NonCash",
      dtoPayerType: "Recipient",
    });
    assert.equal(result.paymentMethod, "NonCash");
    assert.equal(result.payerType, "Recipient");
  });

  it("prefers explicit dto paymentMethod over order mapping", () => {
    const result = resolveNpFinancialFields({
      ...settings,
      dtoPaymentMethod: "Cash",
      orderPaymentMethod: "FOP",
    });
    assert.equal(result.paymentMethod, "Cash");
  });
});
