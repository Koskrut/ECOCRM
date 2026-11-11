import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateClientFinance,
  applyCreditToOverdueOrders,
  clientDebtAfterOrderCredit,
} from "../client-finance";

const rates = { UAH_TO_USD: 0.025, EUR_TO_USD: 1.25, baseCurrency: "USD" as const };
const now = new Date("2026-06-10T12:00:00.000Z");

describe("aggregateClientFinance", () => {
  it("nets operational credit and wallet, and ignores canceled credit", () => {
    const snap = aggregateClientFinance(
      [
        {
          totalAmount: 500,
          debtAmount: 0,
          creditAmount: 500,
          currency: "USD",
          orderStage: "CANCELED",
          legacySource: null,
        },
        {
          totalAmount: 200,
          debtAmount: 200,
          creditAmount: 0,
          currency: "USD",
          orderStage: "SHIPPED",
          paymentDueDate: new Date("2026-06-01T00:00:00.000Z"),
        },
        {
          totalAmount: 80,
          debtAmount: 0,
          creditAmount: 40,
          currency: "USD",
          orderStage: "NEW",
        },
      ],
      [{ amount: 50, currency: "USD" }],
      rates,
      now,
    );
    assert.equal(snap.grossDebt, 200);
    assert.equal(snap.orderCredit, 0);
    assert.equal(snap.clientBalance, 50);
    assert.equal(snap.netDebt, 150);
    assert.equal(snap.overdue, 200);
    assert.equal(snap.revenue, 280);
    assert.equal(snap.ordersWithDebtCount, 1);
  });

  it("keeps Bitrix debt out of the operational position", () => {
    const snap = aggregateClientFinance(
      [
        {
          totalAmount: 900,
          debtAmount: 900,
          currency: "USD",
          orderStage: "SHIPPED",
          legacySource: "bitrix",
          paymentDueDate: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
      [],
      rates,
      now,
    );
    assert.equal(snap.grossDebt, 0);
    assert.equal(snap.netDebt, 0);
    assert.equal(snap.overdue, 0);
    assert.equal(snap.revenue, 0);
    assert.equal(snap.bitrixDebt, 900);
  });

  it("converts a UAH wallet into the base currency", () => {
    const snap = aggregateClientFinance([], [{ amount: 4000, currency: "UAH" }], rates, now);
    assert.equal(snap.clientBalance, 100);
    assert.equal(snap.currency, "USD");
  });

  it("excludes REFUSED orders from revenue", () => {
    const snap = aggregateClientFinance(
      [
        {
          totalAmount: 400,
          debtAmount: 0,
          creditAmount: 400,
          currency: "USD",
          orderStage: "REFUSED",
          legacySource: null,
        },
      ],
      [],
      rates,
      now,
    );
    assert.equal(snap.revenue, 0);
    assert.equal(snap.grossDebt, 0);
  });

  it("does not treat prepayment debt as overdue before the Kyiv due date", () => {
    const snap = aggregateClientFinance(
      [
        {
          totalAmount: 100,
          debtAmount: 100,
          currency: "USD",
          orderStage: "SHIPPED",
          paymentDueDate: new Date("2026-06-10T00:00:00.000Z"),
        },
      ],
      [],
      rates,
      now,
    );
    assert.equal(snap.overdue, 0);
    assert.equal(snap.netDebt, 100);
  });

  it("reduces the client total by an operational overpayment, overdue first", () => {
    const snap = aggregateClientFinance(
      [
        {
          totalAmount: 200,
          debtAmount: 200,
          creditAmount: 0,
          currency: "USD",
          orderStage: "SHIPPED",
          paymentDueDate: new Date("2026-06-01T00:00:00.000Z"),
        },
        {
          totalAmount: 80,
          debtAmount: 0,
          creditAmount: 50,
          currency: "USD",
          orderStage: "COMPLETED",
        },
      ],
      [],
      rates,
      now,
    );
    assert.equal(snap.grossDebt, 200);
    assert.equal(snap.orderCredit, 50);
    assert.equal(snap.netDebt, 150);
    assert.equal(snap.overdue, 150);
  });
});

describe("clientDebtAfterOrderCredit", () => {
  it("nets the overpayment and does not leave overdue above the balance", () => {
    assert.deepEqual(clientDebtAfterOrderCredit(200, 50, 100), { debt: 150, overdue: 50 });
    assert.deepEqual(clientDebtAfterOrderCredit(200, 150, 100), { debt: 50, overdue: 0 });
    assert.deepEqual(clientDebtAfterOrderCredit(100, 300, 100), { debt: 0, overdue: 0 });
  });

  it("applies credit to the oldest overdue invoices first", () => {
    const left = applyCreditToOverdueOrders(
      [
        { days: 3, amount: 40 },
        { days: 20, amount: 100 },
      ],
      50,
    );
    assert.deepEqual(left, [
      { days: 20, amount: 50 },
      { days: 3, amount: 40 },
    ]);
  });
});
