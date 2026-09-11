import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSalesCoverage, evaluateSalesFreshness } from "../sales-freshness.util";

test("evaluateSalesCoverage warns when months below required", () => {
  const cov = evaluateSalesCoverage(3, 6);
  assert.equal(cov.isAdequate, false);
  assert.match(cov.warning ?? "", /3 of 6/);
});

test("CRM coverage alone marks demand fresh without XLS upload", () => {
  const fresh = evaluateSalesFreshness(null, 7, new Date(), {
    distinctMonths: 6,
    requiredMonths: 6,
    demandSource: "crm_orders",
  });
  assert.equal(fresh.isFresh, true);
  assert.equal(fresh.warning, null);
  assert.equal(fresh.demandSource, "crm_orders");
});

test("incomplete CRM coverage without XLS is not fresh", () => {
  const fresh = evaluateSalesFreshness(null, 7, new Date(), {
    distinctMonths: 2,
    requiredMonths: 6,
    demandSource: "crm_orders",
    gapSkuMonths: 4,
  });
  assert.equal(fresh.isFresh, false);
  assert.match(fresh.warning ?? "", /lookback|missing|cover/i);
});

test("evaluateSalesFreshness marks stale when coverage insufficient even with XLS", () => {
  const fresh = evaluateSalesFreshness(
    { id: "u1", postedAt: new Date() },
    7,
    new Date(),
    { distinctMonths: 2, requiredMonths: 6, demandSource: "mixed" },
  );
  assert.equal(fresh.isFresh, false);
  assert.match(fresh.warning ?? "", /only 2/);
});
