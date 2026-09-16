import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseShiftEndReason, SHIFT_REOPEN_WINDOW_MS } from "../field-shift-end.util";

describe("parseShiftEndReason", () => {
  it("accepts known reasons", () => {
    assert.equal(parseShiftEndReason("user"), "user");
    assert.equal(parseShiftEndReason("cron"), "cron");
    assert.equal(parseShiftEndReason("auto_stale_day"), "auto_stale_day");
    assert.equal(parseShiftEndReason("restart"), "restart");
  });

  it("rejects unknown", () => {
    assert.equal(parseShiftEndReason("nope"), null);
    assert.equal(parseShiftEndReason(1), null);
  });

  it("reopen window is 60s", () => {
    assert.equal(SHIFT_REOPEN_WINDOW_MS, 60_000);
  });
});
