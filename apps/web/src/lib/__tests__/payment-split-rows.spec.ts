import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSplitRowsFromOrders,
  buildSplitRowsFromOrdersFifo,
  rowsFromProposedAllocations,
  suggestedRowAmount,
} from "../payment-split-rows";

function sumRows(rows: Array<{ amount: string }>): number {
  return Math.round(rows.reduce((s, r) => s + parseFloat(r.amount), 0) * 100) / 100;
}

test("equal split of 1.00 across 6 orders sums to 1.00", () => {
  const orders = Array.from({ length: 6 }, (_, i) => ({
    id: `o${i}`,
    orderNumber: `70${i}`,
    debtAmount: 0,
    currency: "UAH",
    createdAt: `2026-01-0${i + 1}`,
  }));
  const rows = buildSplitRowsFromOrders(orders, 1, "UAH");
  assert.equal(rows.length, 6);
  assert.equal(sumRows(rows), 1);
});

test("FIFO converts USD debt by the order rate and keeps the payment total", () => {
  const rows = buildSplitRowsFromOrdersFifo(
    [
      {
        id: "later",
        orderNumber: "7002",
        debtAmount: 5,
        currency: "USD",
        exchangeRate: 41,
        paymentDueDate: "2026-02-01",
      },
      {
        id: "sooner",
        orderNumber: "7001",
        debtAmount: 10,
        currency: "USD",
        exchangeRate: 41,
        paymentDueDate: "2026-01-01",
      },
    ],
    615,
    "UAH",
  );
  assert.deepEqual(
    rows.map((r) => [r.orderId, r.amount]),
    [
      ["sooner", "410.00"],
      ["later", "205.00"],
    ],
  );
  assert.equal(sumRows(rows), 615);
});

test("UAH debt is not multiplied by the exchange rate", () => {
  const rows = buildSplitRowsFromOrders(
    [
      {
        id: "a",
        orderNumber: "7001",
        debtAmount: 100,
        currency: "UAH",
        exchangeRate: 41,
        createdAt: "2026-01-01",
      },
    ],
    100,
    "UAH",
  );
  assert.equal(rows[0]?.amount, "100.00");
});

test("overpay beyond debts is added to the last order and still matches", () => {
  const rows = buildSplitRowsFromOrders(
    [
      { id: "a", orderNumber: "7001", debtAmount: 10, currency: "UAH", createdAt: "2026-01-01" },
      { id: "b", orderNumber: "7002", debtAmount: 10, currency: "UAH", createdAt: "2026-01-02" },
    ],
    30,
    "UAH",
  );
  assert.deepEqual(
    rows.map((r) => r.amount),
    ["10.00", "20.00"],
  );
  assert.equal(sumRows(rows), 30);
});

test("proposal drift within 1 unit is absorbed so the rows match the payment", () => {
  const rows = rowsFromProposedAllocations(
    [
      { orderId: "a", amount: 600.4 },
      { orderId: "b", amount: 400 },
    ],
    new Map([
      ["a", "7001"],
      ["b", "7002"],
    ]),
    1000,
  );
  assert.equal(rows[0]?.orderNumber, "7001");
  assert.equal(sumRows(rows), 1000);
});

test("picking an order caps the amount to the unallocated remainder", () => {
  const amount = suggestedRowAmount(
    { id: "b", debtAmount: 80, currency: "UAH" },
    "UAH",
    [{ amount: "70.00" }, { amount: "" }],
    1,
    100,
  );
  assert.equal(amount, "30.00");
});
