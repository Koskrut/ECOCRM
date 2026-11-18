import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateClientFinance,
  clientDebtAfterOrderCredit,
  clientNetDebt,
  earlyOrderCash,
} from "../client-finance";

const rates = { UAH_TO_USD: 0.025, EUR_TO_USD: 1.25, baseCurrency: "USD" as const };
const now = new Date("2026-06-10T12:00:00.000Z");

describe("aggregateClientFinance", () => {
  it("nets operational credit, advance, canceled cash and wallet; overdue stays on invoices", () => {
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
    assert.equal(snap.advance, 540);
    assert.equal(snap.clientBalance, 50);
    assert.equal(snap.netDebt, 0);
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

  it("excludes REFUSED orders from revenue and counts their cash as advance", () => {
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
        {
          totalAmount: 100,
          debtAmount: 100,
          currency: "USD",
          orderStage: "SHIPPED",
          paymentDueDate: new Date("2026-06-01T00:00:00.000Z"),
        },
      ],
      [],
      rates,
      now,
    );
    assert.equal(snap.revenue, 100);
    assert.equal(snap.grossDebt, 100);
    assert.equal(snap.advance, 400);
    assert.equal(snap.netDebt, 0);
    assert.equal(snap.overdue, 100);
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

  it("reduces the client total by an operational overpayment without changing overdue", () => {
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
    assert.equal(snap.overdue, 200);
  });

  it("counts money received before the order is ready to ship without reducing overdue", () => {
    const snap = aggregateClientFinance(
      [
        {
          totalAmount: 200,
          debtAmount: 200,
          paidAmount: 0,
          currency: "USD",
          orderStage: "SHIPPED",
          paymentDueDate: new Date("2026-06-01T00:00:00.000Z"),
        },
        {
          totalAmount: 500,
          debtAmount: 400,
          paidAmount: 100,
          creditAmount: 0,
          currency: "USD",
          orderStage: "CONFIRMED",
        },
        {
          totalAmount: 80,
          debtAmount: 50,
          paidAmount: 30,
          currency: "USD",
          orderStage: "AWAITING_STOCK",
        },
        {
          totalAmount: 40,
          debtAmount: 40,
          paidAmount: 0,
          currency: "USD",
          orderStage: "NEW",
        },
        {
          totalAmount: 70,
          debtAmount: 0,
          paidAmount: 70,
          currency: "USD",
          orderStage: "CANCELED",
        },
      ],
      [],
      rates,
      now,
    );
    assert.equal(snap.grossDebt, 200);
    assert.equal(snap.advance, 200);
    assert.equal(snap.netDebt, 0);
    assert.equal(snap.overdue, 200);
    assert.equal(earlyOrderCash({ orderStage: "AWAITING_PAYMENT", paidAmount: 15, creditAmount: 0 }), 15);
    assert.equal(earlyOrderCash({ orderStage: "NEW", paidAmount: 0, creditAmount: 9 }), 9);
    assert.equal(earlyOrderCash({ orderStage: "SHIPPED", paidAmount: 20 }), 0);
    assert.equal(earlyOrderCash({ orderStage: "NEW", legacySource: "bitrix", paidAmount: 20 }), 0);
    assert.equal(earlyOrderCash({ orderStage: "CANCELED", creditAmount: 12, paidAmount: 99 }), 12);
    assert.equal(earlyOrderCash({ orderStage: "REFUSED", creditAmount: 0, paidAmount: 8 }), 8);
  });
});

describe("clientNetDebt", () => {
  it("nets cash against debt and leaves overdue unchanged via clientDebtAfterOrderCredit", () => {
    assert.equal(clientNetDebt(200, 50), 150);
    assert.equal(clientNetDebt(100, 300), 0);
    assert.deepEqual(clientDebtAfterOrderCredit(200, 50, 100), { debt: 150, overdue: 100 });
    assert.deepEqual(clientDebtAfterOrderCredit(200, 150, 100), { debt: 50, overdue: 100 });
    assert.deepEqual(clientDebtAfterOrderCredit(100, 300, 100), { debt: 0, overdue: 100 });
  });
});
