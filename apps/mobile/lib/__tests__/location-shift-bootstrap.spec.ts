const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  validateShiftBootstrapPrerequisites,
} = require("../location-shift-bootstrap-gate");
const {
  shouldFlushByInterval,
  flushFailureKeepsBuffer,
  FLUSH_INTERVAL_MS,
} = require("../location-flush-schedule");

describe("validateShiftBootstrapPrerequisites", () => {
  it("rejects empty shift id", () => {
    assert.deepEqual(validateShiftBootstrapPrerequisites("", true), {
      ok: false,
      reason: "no_shift_id",
    });
  });

  it("rejects missing token (Ісанчев start race)", () => {
    assert.deepEqual(validateShiftBootstrapPrerequisites("shift-1", false), {
      ok: false,
      reason: "no_token",
    });
  });

  it("passes when shift id + token present", () => {
    assert.deepEqual(validateShiftBootstrapPrerequisites("shift-1", true), { ok: true });
  });
});

describe("shouldFlushByInterval", () => {
  it("flushes when never flushed", () => {
    assert.equal(shouldFlushByInterval(null, 100_000), true);
  });

  it("flushes after FLUSH_INTERVAL_MS", () => {
    const now = 1_000_000;
    const last = new Date(now - FLUSH_INTERVAL_MS - 1).toISOString();
    assert.equal(shouldFlushByInterval(last, now), true);
  });

  it("skips flush inside interval", () => {
    const now = 1_000_000;
    const last = new Date(now - 5_000).toISOString();
    assert.equal(shouldFlushByInterval(last, now), false);
  });
});

describe("flushFailureKeepsBuffer", () => {
  it("401 auth_required keeps buffer (Грибовська)", () => {
    assert.equal(flushFailureKeepsBuffer("auth_required"), true);
  });

  it("network retry keeps buffer", () => {
    assert.equal(flushFailureKeepsBuffer("retry"), true);
  });

  it("discard_all does not keep buffer", () => {
    assert.equal(flushFailureKeepsBuffer("discard_all"), false);
  });
});
