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
  });
});

test("format/parse round-trip date and amount", () => {
  const title = formatDebtCommentTitle("2026-09-01", 1200.5);
  assert.equal(title, `${RECEIVABLES_COMMENT_TITLE} | 2026-09-01 | 1200.50`);
  assert.deepEqual(parseDebtCommentTitle(title), {
    promiseDate: "2026-09-01",
    promiseAmount: 1200.5,
  });
});

test("format without amount keeps date only", () => {
  const title = formatDebtCommentTitle("2026-09-01");
  assert.deepEqual(parseDebtCommentTitle(title), {
    promiseDate: "2026-09-01",
    promiseAmount: null,
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
