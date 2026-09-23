import assert from "node:assert/strict";
import test from "node:test";
import { RECEIVABLES_COMMENT_TITLE } from "../receivables.constants";
import {
  formatDebtCommentTitle,
  isDebtCommentTitle,
  isPromiseBroken,
  isPromiseForYmd,
  parseDebtCommentTitle,
} from "../debt-promise.util";

test("plain receivables title has no promise", () => {
  assert.equal(isDebtCommentTitle(RECEIVABLES_COMMENT_TITLE), true);
  assert.deepEqual(parseDebtCommentTitle(RECEIVABLES_COMMENT_TITLE), {
    promiseDate: null,
    promiseAmount: null,
    delayReasonCode: null,
  });
});

test("format/parse round-trip date and amount", () => {
  const title = formatDebtCommentTitle("2026-09-01", 1200.5);
  assert.equal(title, `${RECEIVABLES_COMMENT_TITLE} | 2026-09-01 | 1200.50`);
  assert.deepEqual(parseDebtCommentTitle(title), {
    promiseDate: "2026-09-01",
    promiseAmount: 1200.5,
    delayReasonCode: null,
  });
});

test("format without amount keeps date only", () => {
  const title = formatDebtCommentTitle("2026-09-01");
  assert.deepEqual(parseDebtCommentTitle(title), {
    promiseDate: "2026-09-01",
    promiseAmount: null,
    delayReasonCode: null,
  });
});

test("format/parse delay reason with and without promise", () => {
  const withReason = formatDebtCommentTitle(null, null, "WAITING_ACT");
  assert.equal(withReason, `${RECEIVABLES_COMMENT_TITLE} | R:WAITING_ACT`);
  assert.deepEqual(parseDebtCommentTitle(withReason), {
    promiseDate: null,
    promiseAmount: null,
    delayReasonCode: "WAITING_ACT",
  });
  const full = formatDebtCommentTitle("2026-09-01", 100, "CLIENT_DELAY");
  assert.deepEqual(parseDebtCommentTitle(full), {
    promiseDate: "2026-09-01",
    promiseAmount: 100,
    delayReasonCode: "CLIENT_DELAY",
  });
});

test("invalid date is stored as a plain comment title", () => {
  assert.equal(formatDebtCommentTitle("01.09.2026", 10), RECEIVABLES_COMMENT_TITLE);
});

test("promise today vs broken", () => {
  assert.equal(isPromiseForYmd("2026-09-01", "2026-09-01"), true);
  assert.equal(isPromiseBroken("2026-08-30", "2026-09-01"), true);
  assert.equal(isPromiseBroken("2026-09-01", "2026-09-01"), false);
  assert.equal(isPromiseBroken(null, "2026-09-01"), false);
});
