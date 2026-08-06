const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  formatMinutesAgo,
  batteryOptimizationLabel,
} = require("../gps-diagnostics-format");

describe("formatMinutesAgo", () => {
  it("formats minutes", () => {
    const now = Date.parse("2026-08-06T12:00:00.000Z");
    const iso = new Date(now - 15 * 60_000).toISOString();
    assert.equal(formatMinutesAgo(iso, now), "15 хв");
  });

  it("returns em dash when missing", () => {
    assert.equal(formatMinutesAgo(null), "—");
  });
});

describe("batteryOptimizationLabel", () => {
  it("explains unknown as check Unrestricted", () => {
    assert.match(batteryOptimizationLabel("unknown"), /Unrestricted/i);
  });
});
