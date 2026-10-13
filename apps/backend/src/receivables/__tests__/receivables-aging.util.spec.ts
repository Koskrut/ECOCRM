import assert from "node:assert/strict";
import test from "node:test";
import {
  agingBucketIndex,
  agingBucketLabel,
  accumulateAgingAmount,
  buildAgingBuckets,
  createEmptyAgingBuckets,
  isAgingBucketLabel,
  RECEIVABLES_AGING_BUCKET_LABELS,
} from "../receivables-aging.util";

test("bucket labels", () => {
  assert.deepEqual([...RECEIVABLES_AGING_BUCKET_LABELS], ["0-7", "8-30", "31-60", "61-90", "90+"]);
  assert.equal(isAgingBucketLabel("61-90"), true);
  assert.equal(isAgingBucketLabel("60+"), false);
  assert.equal(isAgingBucketLabel(undefined), false);
});

test("agingBucketIndex maps day ranges", () => {
  assert.equal(agingBucketIndex(0), 0);
  assert.equal(agingBucketIndex(7), 0);
  assert.equal(agingBucketIndex(8), 1);
  assert.equal(agingBucketIndex(30), 1);
  assert.equal(agingBucketIndex(31), 2);
  assert.equal(agingBucketIndex(60), 2);
  assert.equal(agingBucketIndex(61), 3);
  assert.equal(agingBucketIndex(90), 3);
  assert.equal(agingBucketIndex(91), 4);
  assert.equal(agingBucketIndex(400), 4);
  assert.equal(agingBucketLabel(75), "61-90");
  assert.equal(agingBucketLabel(91), "90+");
});

test("accumulateAgingAmount fills buckets", () => {
  const buckets = createEmptyAgingBuckets();
  accumulateAgingAmount(buckets, 3, 100);
  accumulateAgingAmount(buckets, 15, 50);
  accumulateAgingAmount(buckets, 45, 25);
  accumulateAgingAmount(buckets, 90, 10);
  accumulateAgingAmount(buckets, 120, 5);
  assert.deepEqual(
    buckets.map((b) => b.amount),
    [100, 50, 25, 10, 5],
  );
  assert.equal(buckets[0]!.ordersCount, 1);
});

test("buildAgingBuckets splits a client's orders across buckets", () => {
  const buckets = buildAgingBuckets([
    {
      contactId: "a",
      overdueOrders: [
        { days: 5, amount: 100 },
        { days: 40, amount: 200 },
        { days: 100, amount: 50 },
      ],
    },
    { contactId: "b", overdueOrders: [{ days: 3, amount: 10.005 }, { days: 6, amount: 20 }] },
    { contactId: "c", overdueOrders: [] },
    { contactId: "d", overdueOrders: [{ days: 0, amount: 999 }] },
  ]);
  const byLabel = Object.fromEntries(buckets.map((b) => [b.label, b]));
  assert.equal(byLabel["0-7"]!.amount, 130.01);
  assert.equal(byLabel["0-7"]!.ordersCount, 3);
  assert.equal(byLabel["0-7"]!.clientsCount, 2);
  assert.equal(byLabel["31-60"]!.amount, 200);
  assert.equal(byLabel["31-60"]!.clientsCount, 1);
  assert.equal(byLabel["61-90"]!.ordersCount, 0);
  assert.equal(byLabel["90+"]!.amount, 50);
  assert.equal(byLabel["90+"]!.clientsCount, 1);
});
