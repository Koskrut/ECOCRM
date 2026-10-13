import assert from "node:assert/strict";
import test from "node:test";
import { RECEIVABLES_COMMENT_TITLE } from "../receivables.constants";
import {
  activeSnoozeYmd,
  computeSnoozeUntilYmd,
  formatSnoozeActivityTitle,
  snoozeYmdToDbDate,
} from "../receivables-snooze.util";

test("days presets add calendar days in Kyiv", () => {
  assert.deepEqual(computeSnoozeUntilYmd({ days: 1 }, "2026-10-13"), { ok: true, until: "2026-10-14" });
  assert.deepEqual(computeSnoozeUntilYmd({ days: 3 }, "2026-10-30"), { ok: true, until: "2026-11-02" });
  assert.deepEqual(computeSnoozeUntilYmd({ days: 7 }, "2026-12-28"), { ok: true, until: "2027-01-04" });
  assert.deepEqual(computeSnoozeUntilYmd({ days: "3" }, "2026-10-13"), { ok: true, until: "2026-10-16" });
});

test("days across DST change stays a calendar date", () => {
  assert.deepEqual(computeSnoozeUntilYmd({ days: 1 }, "2026-10-24"), { ok: true, until: "2026-10-25" });
  assert.deepEqual(computeSnoozeUntilYmd({ days: 3 }, "2026-03-28"), { ok: true, until: "2026-03-31" });
});

test("rejects days outside whitelist", () => {
  for (const days of [0, 2, 5, 30, -1, undefined, "x"]) {
    assert.equal(computeSnoozeUntilYmd({ days }, "2026-10-13").ok, false);
  }
});

test("explicit until must be a future valid date within limit", () => {
  assert.deepEqual(computeSnoozeUntilYmd({ until: "2026-10-20" }, "2026-10-13"), {
    ok: true,
    until: "2026-10-20",
  });
  assert.equal(computeSnoozeUntilYmd({ until: "2026-10-13" }, "2026-10-13").ok, false);
  assert.equal(computeSnoozeUntilYmd({ until: "2026-10-01" }, "2026-10-13").ok, false);
  assert.equal(computeSnoozeUntilYmd({ until: "2026-02-31" }, "2026-01-13").ok, false);
  assert.equal(computeSnoozeUntilYmd({ until: "13.10.2026" }, "2026-10-01").ok, false);
  assert.equal(computeSnoozeUntilYmd({ until: "2027-06-01" }, "2026-10-13").ok, false);
});

test("activeSnoozeYmd hides expired snoozes", () => {
  const until = snoozeYmdToDbDate("2026-10-16");
  assert.equal(activeSnoozeYmd(until, "2026-10-13"), "2026-10-16");
  assert.equal(activeSnoozeYmd(until, "2026-10-15"), "2026-10-16");
  assert.equal(activeSnoozeYmd(until, "2026-10-16"), null);
  assert.equal(activeSnoozeYmd(until, "2026-10-20"), null);
  assert.equal(activeSnoozeYmd(null, "2026-10-13"), null);
});

test("activity title does not look like a debt comment", () => {
  const title = formatSnoozeActivityTitle("2026-10-16");
  assert.equal(title, "Відкладено (дебіторка) до 16.10");
  assert.equal(title.startsWith(RECEIVABLES_COMMENT_TITLE), false);
});
