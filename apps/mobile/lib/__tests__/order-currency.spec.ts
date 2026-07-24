const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  formatBaseMoney,
  formatOrderAmount,
  normalizeBaseCurrency,
  orderCurrencySymbol,
} = require("../order-currency");

describe("orderCurrencySymbol", () => {
  it("maps USD/EUR/UAH", () => {
    assert.equal(orderCurrencySymbol("EUR"), "€");
    assert.equal(orderCurrencySymbol("usd"), "$");
    assert.equal(orderCurrencySymbol("UAH"), "₴");
  });
});

describe("normalizeBaseCurrency", () => {
  it("defaults to USD", () => {
    assert.equal(normalizeBaseCurrency("EUR"), "EUR");
    assert.equal(normalizeBaseCurrency("usd"), "USD");
    assert.equal(normalizeBaseCurrency(null), "USD");
  });
});

describe("formatBaseMoney", () => {
  it("uses currency symbol", () => {
    assert.equal(formatBaseMoney(12.5, "EUR"), "12.50 €");
    assert.equal(formatBaseMoney(10, "USD"), "10.00 $");
  });
});

describe("formatOrderAmount", () => {
  it("adds UAH estimate for foreign currency", () => {
    assert.equal(formatOrderAmount(10, "EUR", 45), "10.00 € (450 ₴)");
    assert.equal(formatOrderAmount(10, "EUR", null), "10.00 €");
    assert.equal(formatOrderAmount(100, "UAH"), "100.00 ₴");
  });
});
