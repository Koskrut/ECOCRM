const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { formatKyivDateKey } = require("../date");

describe("formatKyivDateKey", () => {
  it("uses Europe/Kyiv calendar day near midnight (22:00 UTC = next Kyiv day)", () => {
    const instant = new Date("2026-07-20T22:00:00.000Z");
    assert.equal(formatKyivDateKey(instant), "2026-07-21");
  });

  it("aligns with backend Kyiv day when device would use UTC date", () => {
    const instant = new Date("2026-07-20T22:00:00.000Z");
    const utcDateKey = instant.toISOString().slice(0, 10);
    assert.equal(utcDateKey, "2026-07-20");
    assert.equal(formatKyivDateKey(instant), "2026-07-21");
  });
});
