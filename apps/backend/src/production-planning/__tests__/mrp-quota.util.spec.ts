import test from "node:test";
import assert from "node:assert/strict";
import { allocateMonthlyQuota, coverDays, coverStatus } from "../mrp-quota.util";

test("allocateMonthlyQuota prioritizes critical and tracks month0Qty", () => {
  const slices = allocateMonthlyQuota(
    [
      { key: "a", productId: "a", partsQty: 5000, priority: 10, deficit: 5000 },
      { key: "b", productId: "b", partsQty: 4000, priority: 40, deficit: 4000 },
      { key: "c", productId: "c", partsQty: 3000, priority: 80, deficit: 3000 },
    ],
    7000,
    3,
  );

  const byKey = new Map(slices.map((s) => [s.key, s]));
  assert.equal(byKey.get("a")?.suggestedLaunchQty, 5000);
  assert.equal(byKey.get("a")?.monthBucket, 0);
  assert.equal(byKey.get("a")?.month0Qty, 5000);
  assert.equal(byKey.get("b")?.suggestedLaunchQty, 4000);
  assert.equal(byKey.get("b")?.monthBucket, 0);
  assert.equal(byKey.get("b")?.month0Qty, 2000);
  assert.equal(byKey.get("b")?.overflowed, false);
  assert.equal(byKey.get("c")?.monthBucket, 1);
  assert.equal(byKey.get("c")?.month0Qty, 0);
  assert.equal(byKey.get("c")?.suggestedLaunchQty, 3000);

  const month0Total = slices.reduce((s, x) => s + x.month0Qty, 0);
  assert.equal(month0Total, 7000);
});

test("allocateMonthlyQuota marks overflow beyond horizon buckets", () => {
  const slices = allocateMonthlyQuota(
    [{ key: "x", productId: "x", partsQty: 20_000, priority: 10, deficit: 20_000 }],
    7000,
    2,
  );
  assert.equal(slices[0]?.suggestedLaunchQty, 14_000);
  assert.equal(slices[0]?.month0Qty, 7000);
  assert.equal(slices[0]?.overflowed, true);
});

test("coverDays returns null for zero velocity", () => {
  assert.equal(coverDays(0, 0), null);
  assert.equal(coverDays(100, 0), null);
  assert.equal(coverDays(90, 3), 30);
});

test("coverStatus thresholds", () => {
  assert.equal(coverStatus(10, 60, 30), "CRITICAL");
  assert.equal(coverStatus(45, 60, 30), "WARN");
  assert.equal(coverStatus(90, 60, 30), "OK");
});
