const { describe, it } = require("node:test");
const assert = require("node:assert");
const { bucketUnmatchedByMonth } = require("../unmatched-summary.util");

describe("bucketUnmatchedByMonth", () => {
  it("returns empty summary for no rows", () => {
    assert.deepStrictEqual(bucketUnmatchedByMonth([]), {
      months: [],
      total: { count: 0, totals: [] },
    });
  });

  it("buckets by Kyiv calendar month (UTC late evening belongs to next month)", () => {
    const summary = bucketUnmatchedByMonth([
      // 2026-09-30 22:30 UTC = 2026-10-01 01:30 Kyiv
      { bookedAt: new Date("2026-09-30T22:30:00Z"), currency: "UAH", remaining: 100 },
      { bookedAt: new Date("2026-09-15T10:00:00Z"), currency: "UAH", remaining: 50 },
    ]);
    assert.deepStrictEqual(
      summary.months.map((m: { month: string; count: number }) => [m.month, m.count]),
      [
        ["2026-10", 1],
        ["2026-09", 1],
      ],
    );
  });

  it("sums residuals per currency and skips fully allocated rows", () => {
    const summary = bucketUnmatchedByMonth([
      { bookedAt: new Date("2026-10-02T10:00:00Z"), currency: "UAH", remaining: 1000.25 },
      { bookedAt: new Date("2026-10-03T10:00:00Z"), currency: "uah", remaining: 500 },
      { bookedAt: new Date("2026-10-04T10:00:00Z"), currency: "USD", remaining: 20 },
      { bookedAt: new Date("2026-10-05T10:00:00Z"), currency: "UAH", remaining: 0 },
    ]);
    assert.strictEqual(summary.total.count, 3);
    assert.deepStrictEqual(summary.months[0].totals, [
      { currency: "UAH", amount: 1500.25 },
      { currency: "USD", amount: 20 },
    ]);
    assert.deepStrictEqual(summary.total.totals, summary.months[0].totals);
  });
});
