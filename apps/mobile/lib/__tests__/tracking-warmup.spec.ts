const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { TRACKING_WARMUP_MS, isWarmupActiveUntil } = require("../tracking-warmup-core");

describe("tracking warmup", () => {
  it("detects active warmup window from ISO timestamp", () => {
    const now = Date.now();
    const until = new Date(now + TRACKING_WARMUP_MS).toISOString();
    assert.equal(isWarmupActiveUntil(until, now + 60_000), true);
    assert.equal(isWarmupActiveUntil(until, now + TRACKING_WARMUP_MS + 1), false);
    assert.equal(isWarmupActiveUntil(null, now), false);
  });
});
