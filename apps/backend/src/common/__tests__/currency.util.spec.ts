import assert from "node:assert/strict";
import test from "node:test";
import {
  computeOrderExchangeRate,
  getBaseCurrency,
  normalizeBaseCurrency,
  paymentToBase,
  toBaseCurrency,
  toUsd,
  usdToBase,
} from "../currency.util";
import type { ExchangeRates } from "../../settings/settings.service";

const rates: ExchangeRates = {
  UAH_TO_USD: 0.024,
  EUR_TO_USD: 1.05,
  baseCurrency: "USD",
};

const eurRates: ExchangeRates = { ...rates, baseCurrency: "EUR" };

test("normalizeBaseCurrency defaults to USD", () => {
  assert.equal(normalizeBaseCurrency(undefined), "USD");
  assert.equal(normalizeBaseCurrency("EUR"), "EUR");
  assert.equal(normalizeBaseCurrency("invalid"), "USD");
});

test("toUsd converts UAH and EUR", () => {
  assert.equal(toUsd(100, "USD", rates), 100);
  assert.equal(toUsd(1000, "UAH", rates), 24);
  assert.equal(toUsd(100, "EUR", rates), 105);
});

test("toBaseCurrency with USD base", () => {
  assert.equal(toBaseCurrency(100, "USD", rates), 100);
  assert.equal(toBaseCurrency(1000, "UAH", rates), 24);
});

test("toBaseCurrency with EUR base", () => {
  assert.equal(toBaseCurrency(105, "USD", eurRates), 100);
  assert.equal(toBaseCurrency(100, "EUR", eurRates), 100);
  assert.equal(toBaseCurrency(1000, "UAH", eurRates), 24 / 1.05);
});

test("paymentToBase prefers amountUsd", () => {
  assert.equal(paymentToBase(105, 50, "UAH", eurRates), 100);
  assert.equal(paymentToBase(null, 100, "USD", rates), 100);
});

test("computeOrderExchangeRate", () => {
  const uahPerUsd = 1 / 0.024;
  assert.equal(computeOrderExchangeRate("USD", rates), uahPerUsd);
  assert.equal(computeOrderExchangeRate("EUR", rates), uahPerUsd * 1.05);
  assert.equal(computeOrderExchangeRate("UAH", rates), null);
});

test("usdToBase", () => {
  assert.equal(usdToBase(105, eurRates), 100);
  assert.equal(usdToBase(100, rates), 100);
});
