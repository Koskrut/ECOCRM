import assert from "node:assert/strict";
import test from "node:test";
import {
  agingBucketIndex,
  accumulateAgingAmount,
  createEmptyAgingBuckets,
} from "../receivables-aging.util";

test("agingBucketIndex maps day ranges", () => {
  assert.equal(agingBucketIndex(0), 0);
  assert.equal(agingBucketIndex(7), 0);
  assert.equal(agingBucketIndex(8), 1);
  assert.equal(agingBucketIndex(30), 1);
  assert.equal(agingBucketIndex(31), 2);
  assert.equal(agingBucketIndex(60), 2);
  assert.equal(agingBucketIndex(61), 3);
  assert.equal(agingBucketIndex(120), 3);
});

test("accumulateAgingAmount fills buckets", () => {
  const buckets = createEmptyAgingBuckets();
  accumulateAgingAmount(buckets, 3, 100);
  accumulateAgingAmount(buckets, 15, 50);
  accumulateAgingAmount(buckets, 45, 25);
  accumulateAgingAmount(buckets, 90, 10);
  assert.equal(buckets[0]!.amount, 100);
  assert.equal(buckets[1]!.amount, 50);
  assert.equal(buckets[2]!.amount, 25);
  assert.equal(buckets[3]!.amount, 10);
  assert.equal(buckets[0]!.ordersCount, 1);
});
