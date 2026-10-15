import assert from "node:assert/strict";
import test from "node:test";
import {
  amountsMatchForReuse,
  buildFullDebtPayPurpose,
  computeFullDebtPayAmountUah,
  pickPayLinkAnchorOrder,
  pickPrimaryDebtOrder,
} from "../receivables-full-debt-pay-link.util";

/** Start of day used as overdue cutoff (due today = not overdue). */
const asOf = new Date("2026-10-13T00:00:00.000Z");

test("pickPrimaryDebtOrder prefers overdue then higher debt", () => {
  const orders = [
    {
      id: "a",
      debtAmount: 100,
      exchangeRate: 40,
      paymentDueDate: new Date("2026-10-20"),
      bankAccountId: "ba1",
    },
    {
      id: "b",
      debtAmount: 50,
      exchangeRate: 40,
      paymentDueDate: new Date("2026-09-01"),
      bankAccountId: "ba1",
    },
    {
      id: "c",
      debtAmount: 80,
      exchangeRate: 40,
      paymentDueDate: new Date("2026-08-01"),
      bankAccountId: null,
    },
  ];
  assert.equal(pickPrimaryDebtOrder(orders, asOf)?.id, "c");
});

test("pickPayLinkAnchorOrder falls back to order with bank account", () => {
  const orders = [
    {
      id: "primary",
      debtAmount: 100,
      exchangeRate: 40,
      paymentDueDate: new Date("2026-08-01"),
      bankAccountId: null,
    },
    {
      id: "with-bank",
      debtAmount: 20,
      exchangeRate: 41,
      paymentDueDate: new Date("2026-10-20"),
      bankAccountId: "ba1",
    },
  ];
  assert.equal(pickPayLinkAnchorOrder(orders, asOf)?.id, "with-bank");
});

test("computeFullDebtPayAmountUah sums per-order rates with fallback", () => {
  const uah = computeFullDebtPayAmountUah(
    [
      { debtAmount: 10, exchangeRate: 40 },
      { debtAmount: 5, exchangeRate: null },
      { debtAmount: 0, exchangeRate: 40 },
    ],
    42,
  );
  assert.equal(uah, 400 + 210);
});

test("amountsMatchForReuse and purpose text", () => {
  assert.equal(amountsMatchForReuse(100.01, 100), true);
  assert.equal(amountsMatchForReuse(100.5, 100), false);
  assert.match(buildFullDebtPayPurpose({ anchorOrderNumber: "1001", debtOrderCount: 1 }), /1001/);
  assert.match(buildFullDebtPayPurpose({ anchorOrderNumber: "1001", debtOrderCount: 3 }), /3 зам/);
});
