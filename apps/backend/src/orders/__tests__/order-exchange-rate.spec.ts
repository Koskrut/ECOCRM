import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  nextExchangeRateIfChanged,
  shouldRefreshExchangeRateOnStageChange,
} from "../order-exchange-rate";

describe("shouldRefreshExchangeRateOnStageChange", () => {
  it("refreshes when confirming from awaiting stock", () => {
    assert.equal(shouldRefreshExchangeRateOnStageChange("AWAITING_STOCK", "CONFIRMED"), true);
  });

  it("refreshes when confirming from new or awaiting payment", () => {
    assert.equal(shouldRefreshExchangeRateOnStageChange("NEW", "CONFIRMED"), true);
    assert.equal(shouldRefreshExchangeRateOnStageChange(null, "CONFIRMED"), true);
    assert.equal(shouldRefreshExchangeRateOnStageChange("AWAITING_PAYMENT", "CONFIRMED"), true);
  });

  it("keeps the rate when the order was already confirmed", () => {
    assert.equal(shouldRefreshExchangeRateOnStageChange("READY_TO_SHIP", "CONFIRMED"), false);
    assert.equal(shouldRefreshExchangeRateOnStageChange("CONFIRMED", "CONFIRMED"), false);
    assert.equal(shouldRefreshExchangeRateOnStageChange("SHIPPED", "CONFIRMED"), false);
  });

  it("does not refresh on other stage changes", () => {
    assert.equal(shouldRefreshExchangeRateOnStageChange("AWAITING_STOCK", "NEW"), false);
    assert.equal(shouldRefreshExchangeRateOnStageChange("CONFIRMED", "READY_TO_SHIP"), false);
  });
});

describe("nextExchangeRateIfChanged", () => {
  it("returns the fresh rate when the quote moved", () => {
    assert.equal(nextExchangeRateIfChanged(45.5, 47), 47);
    assert.equal(nextExchangeRateIfChanged(null, 47), 47);
  });

  it("skips a write when the rate is unchanged or unusable", () => {
    assert.equal(nextExchangeRateIfChanged(47, 47), undefined);
    assert.equal(nextExchangeRateIfChanged(47, 47 + 1e-9), undefined);
    assert.equal(nextExchangeRateIfChanged(45.5, null), undefined);
    assert.equal(nextExchangeRateIfChanged(45.5, 0), undefined);
    assert.equal(nextExchangeRateIfChanged(45.5, Number.NaN), undefined);
  });
});
