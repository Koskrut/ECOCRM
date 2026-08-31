import assert from "node:assert/strict";
import test from "node:test";
import {
  collectionScore,
  formatDebtCommentTitle,
  parseDebtCommentTitle,
  pickTodayCollectQueue,
} from "../debt-promise";

test("title round-trip", () => {
  const title = formatDebtCommentTitle("2026-09-02", 90);
  assert.deepEqual(parseDebtCommentTitle(title), {
    promiseDate: "2026-09-02",
    promiseAmount: 90,
  });
});

test("queue ranks broken promise and overdue higher", () => {
  const yesterday = "2020-01-01";
  const rows = [
    {
      contactId: "small",
      overdueAmount: 10,
      debtAmount: 10,
      overdueDays: 1,
      lastCommentAt: new Date().toISOString(),
      promiseDate: null,
    },
    {
      contactId: "broken",
      overdueAmount: 10,
      debtAmount: 10,
      overdueDays: 1,
      lastCommentAt: new Date().toISOString(),
      promiseDate: yesterday,
    },
  ];
  assert.ok(collectionScore(rows[1]!) > collectionScore(rows[0]!));
  const queue = pickTodayCollectQueue(rows, 10);
  assert.equal(queue.items[0]?.contactId, "broken");
  assert.equal(queue.paretoCount, 2);
});

test("pareto counts clients covering 80% overdue", () => {
  const rows = [
    { overdueAmount: 80, debtAmount: 80, lastCommentAt: null, overdueDays: 10, promiseDate: null },
    { overdueAmount: 15, debtAmount: 15, lastCommentAt: null, overdueDays: 2, promiseDate: null },
    { overdueAmount: 5, debtAmount: 5, lastCommentAt: null, overdueDays: 2, promiseDate: null },
  ];
  const queue = pickTodayCollectQueue(rows, 10);
  assert.equal(queue.overdueTotal, 100);
  assert.equal(queue.paretoCount, 1);
});
