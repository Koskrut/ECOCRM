import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSalesCoverage, evaluateSalesFreshness } from "../sales-freshness.util";

test("evaluateSalesCoverage warns when months below required", () => {
  const cov = evaluateSalesCoverage(3, 6);
  assert.equal(cov.isAdequate, false);
  assert.match(cov.warning ?? "", /3 of 6/);
});

test("evaluateSalesFreshness marks stale when coverage insufficient", () => {
  const fresh = evaluateSalesFreshness(
    { id: "u1", postedAt: new Date() },
    7,
    new Date(),
    { distinctMonths: 2, requiredMonths: 6 },
  );
  assert.equal(fresh.isFresh, false);
  assert.match(fresh.warning ?? "", /cover only 2/);
});
