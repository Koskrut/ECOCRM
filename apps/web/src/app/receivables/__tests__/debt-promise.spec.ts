import assert from "node:assert/strict";
import test from "node:test";
import { collectionScore, isSnoozeActive, pickTodayCollectQueue } from "../debt-promise";

test("queue ranks broken promise and overdue higher", () => {
  const yesterday = "2020-01-01";
  const today = "2026-10-13";
  const rows = [
    {
      contactId: "small",
      overdueAmount: 10,
      debtAmount: 10,
      overdueDays: 1,
      lastCommentAt: new Date().toISOString(),
      promiseDate: null as string | null,
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
  assert.ok(collectionScore(rows[1]!, today) > collectionScore(rows[0]!, today));
  const queue = pickTodayCollectQueue(rows, 10, today);
  assert.equal(queue.items[0]?.contactId, "broken");
  assert.equal(queue.paretoCount, 2);
});

test("pareto counts clients covering 80% overdue", () => {
  const today = "2026-10-13";
  const rows = [
    { overdueAmount: 80, debtAmount: 80, lastCommentAt: null, overdueDays: 10, promiseDate: null },
    { overdueAmount: 15, debtAmount: 15, lastCommentAt: null, overdueDays: 2, promiseDate: null },
    { overdueAmount: 5, debtAmount: 5, lastCommentAt: null, overdueDays: 2, promiseDate: null },
  ];
  const queue = pickTodayCollectQueue(rows, 10, today);
  assert.equal(queue.overdueTotal, 100);
  assert.equal(queue.paretoCount, 1);
});

test("pickTodayCollectQueue skips active snoozes and keeps expired", () => {
  const today = "2026-10-13";
  const rows = [
    {
      contactId: "snoozed",
      overdueAmount: 100,
      debtAmount: 100,
      overdueDays: 20,
      lastCommentAt: null,
      promiseDate: null,
      snoozedUntil: "2026-10-20",
    },
    {
      contactId: "expired",
      overdueAmount: 50,
      debtAmount: 50,
      overdueDays: 10,
      lastCommentAt: null,
      promiseDate: null,
      snoozedUntil: "2026-10-13",
    },
    {
      contactId: "active",
      overdueAmount: 40,
      debtAmount: 40,
      overdueDays: 5,
      lastCommentAt: null,
      promiseDate: null,
      snoozedUntil: null,
    },
  ];
  assert.equal(isSnoozeActive("2026-10-20", today), true);
  assert.equal(isSnoozeActive("2026-10-13", today), false);
  assert.equal(isSnoozeActive(null, today), false);

  const queue = pickTodayCollectQueue(rows, 10, today);
  const ids = queue.items.map((r) => r.contactId);
  assert.equal(ids.includes("snoozed"), false);
  assert.equal(ids.includes("expired"), true);
  assert.equal(ids.includes("active"), true);
  assert.equal(queue.items[0]?.contactId, "expired");
});
