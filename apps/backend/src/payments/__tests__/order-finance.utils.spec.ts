import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeOrderDebtAndCredit,
  fixedAmountUsd,
  isHryvniaPostedAsUsd,
  paymentAmountInOrderCurrency,
  roundMoney,
} from "../order-finance.utils";

describe("computeOrderDebtAndCredit", () => {
  it("sets credit after partial return on fully paid order (Oksana case)", () => {
    const r = computeOrderDebtAndCredit({
      totalAmount: 1000,
      returnAdjustmentAmount: 300,
      paidAmount: 1000,
      fxWriteOffAmount: 0,
    });
    assert.equal(r.effectiveTotal, 700);
    assert.equal(r.debtAmount, 0);
    assert.equal(r.creditAmount, 300);
  });

  it("sets debt when underpaid", () => {
    const r = computeOrderDebtAndCredit({
      totalAmount: 1000,
      returnAdjustmentAmount: 0,
      paidAmount: 400,
    });
    assert.equal(r.debtAmount, 600);
    assert.equal(r.creditAmount, 0);
  });

  it("backfill formula matches creditAmount", () => {
    const paidAmount = 1000;
    const totalAmount = 1000;
    const returnAdjustmentAmount = 250;
    const backfill = Math.max(0, paidAmount - Math.max(0, totalAmount - returnAdjustmentAmount));
    const r = computeOrderDebtAndCredit({
      totalAmount,
      returnAdjustmentAmount,
      paidAmount,
    });
    assert.equal(r.creditAmount, backfill);
    assert.equal(backfill, 250);
  });

  it("fx write-off closes residual debt without inventing credit", () => {
    const r = computeOrderDebtAndCredit({
      totalAmount: 100,
      paidAmount: 99,
      fxWriteOffAmount: 1,
    });
    assert.equal(r.debtAmount, 0);
    assert.equal(r.creditAmount, 0);
  });

  it("fx write-off does not inflate credit on overpay", () => {
    const r = computeOrderDebtAndCredit({
      totalAmount: 700,
      paidAmount: 1000,
      fxWriteOffAmount: 50,
    });
    assert.equal(r.creditAmount, 300);
    assert.equal(r.debtAmount, 0);
  });

  it("canceled order has zero debt and paid amount becomes credit", () => {
    const r = computeOrderDebtAndCredit({
      totalAmount: 1000,
      paidAmount: 300,
      orderStage: "CANCELED",
    });
    assert.equal(r.effectiveTotal, 0);
    assert.equal(r.debtAmount, 0);
    assert.equal(r.creditAmount, 300);
  });

  it("zeros debt on refused and fully returned orders", () => {
    for (const orderStage of ["REFUSED", "FULLY_RETURNED"] as const) {
      const open = computeOrderDebtAndCredit({
        totalAmount: 2687,
        paidAmount: 0,
        orderStage: "RECEIVED",
      });
      assert.equal(open.debtAmount, 2687);
      const closed = computeOrderDebtAndCredit({
        totalAmount: 2687,
        paidAmount: 0,
        orderStage,
      });
      assert.equal(closed.debtAmount, 0);
      assert.equal(closed.creditAmount, 0);
      assert.equal(closed.effectiveTotal, 0);
    }
  });
});

describe("paymentAmountInOrderCurrency", () => {
  const rates = { UAH_TO_USD: 0.025, EUR_TO_USD: 1.25, baseCurrency: "USD" as const };

  it("keeps USD orders on the frozen USD equivalent", () => {
    assert.equal(
      paymentAmountInOrderCurrency(
        { amount: 4100, currency: "UAH", amountUsd: 100 },
        "USD",
        rates,
      ),
      100,
    );
  });

  it("keeps an EUR payment on an EUR order in EUR", () => {
    assert.equal(
      paymentAmountInOrderCurrency(
        { amount: 80, currency: "EUR", amountUsd: 100 },
        "EUR",
        rates,
      ),
      80,
    );
  });

  it("does not revalue a hryvnia payment when amountUsd is empty", () => {
    const payment = { amount: 40040, currency: "UAH", amountUsd: null };
    const at47 = paymentAmountInOrderCurrency(payment, "USD", {
      UAH_TO_USD: 1 / 47,
      EUR_TO_USD: 1.1,
      baseCurrency: "USD",
    });
    const at45 = paymentAmountInOrderCurrency(payment, "USD", {
      UAH_TO_USD: 1 / 45,
      EUR_TO_USD: 1.1,
      baseCurrency: "USD",
    });
    assert.equal(at47, 0);
    assert.equal(at45, 0);
  });

  it("keeps a USD payment without amountUsd as that dollar amount", () => {
    assert.equal(
      paymentAmountInOrderCurrency({ amount: 120, currency: "USD", amountUsd: null }, "USD", rates),
      120,
    );
  });

  it("converts a USD equivalent into EUR instead of subtracting USD from EUR", () => {
    const paid = paymentAmountInOrderCurrency(
      { amount: 4000, currency: "UAH", amountUsd: 100 },
      "EUR",
      rates,
    );
    assert.equal(paid, 80);
    const finance = computeOrderDebtAndCredit({
      totalAmount: 80,
      paidAmount: paid,
    });
    assert.equal(finance.debtAmount, 0);
    assert.equal(finance.creditAmount, 0);
  });
});

describe("fixedAmountUsd", () => {
  const settingsRate = { UAH_TO_USD: 1 / 47, EUR_TO_USD: 1.1, baseCurrency: "USD" as const };

  it("converts hryvnia once at the settings rate from the payment moment", () => {
    assert.equal(
      fixedAmountUsd({
        amount: 40040,
        paymentCurrency: "UAH",
        rates: settingsRate,
      }),
      roundMoney(40040 / 47),
    );
  });

  it("does not turn raw hryvnia into dollars when the payment rate is missing", () => {
    assert.equal(
      fixedAmountUsd({
        amount: 40040,
        paymentCurrency: "UAH",
      }),
      null,
    );
  });

  it("detects 40040 hryvnia posted as USD on the order", () => {
    assert.equal(
      isHryvniaPostedAsUsd({
        amount: 40040,
        paymentCurrency: "USD",
        orderCurrency: "USD",
        exchangeRate: 45,
        targetsUsd: [889.78],
      }),
      true,
    );
    assert.equal(
      isHryvniaPostedAsUsd({
        amount: 100,
        paymentCurrency: "USD",
        orderCurrency: "USD",
        exchangeRate: 45,
        targetsUsd: [889.78],
      }),
      false,
    );
    assert.equal(
      isHryvniaPostedAsUsd({
        amount: 40040,
        paymentCurrency: "UAH",
        orderCurrency: "USD",
        exchangeRate: 45,
        targetsUsd: [889.78],
      }),
      false,
    );
  });
});

describe("roundMoney", () => {
  it("rounds to cents", () => {
    assert.equal(roundMoney(1.006), 1.01);
    assert.equal(roundMoney(1.004), 1);
  });
});
