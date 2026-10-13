import assert from "node:assert/strict";
import test from "node:test";
import { matchesAging, matchesAgingBucket } from "../aging";

test("matchesAging chips include 61-90", () => {
  assert.equal(matchesAging(3, ""), true);
  assert.equal(matchesAging(3, "0-7"), true);
  assert.equal(matchesAging(10, "0-7"), false);
  assert.equal(matchesAging(10, "8-30"), true);
  assert.equal(matchesAging(45, "31-60"), true);
  assert.equal(matchesAging(61, "61-90"), true);
  assert.equal(matchesAging(90, "61-90"), true);
  assert.equal(matchesAging(91, "61-90"), false);
  assert.equal(matchesAging(91, "90+"), true);
  assert.equal(matchesAging(61, "90+"), false);
  assert.equal(matchesAging(30, "90+"), false);
});

test("matchesAgingBucket uses server bucket labels", () => {
  assert.equal(matchesAgingBucket("61-90", "61-90"), true);
  assert.equal(matchesAgingBucket("90+", "61-90"), false);
  assert.equal(matchesAgingBucket(null, ""), true);
});
