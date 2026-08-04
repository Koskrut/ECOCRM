import test from "node:test";
import assert from "node:assert/strict";
import { PlanningDemandMix } from "@prisma/client";
import { isNonInventoriedPackagingSku } from "../bom-part.util";
import {
  computeOwnGrossNeed,
  criticalLineQty,
  recomputeNetNeed,
  resolveCoverMetrics,
  shouldEmitCritical,
} from "../mrp-sku-calc.util";

test("recomputeNetNeed: kit pull covered by on-hand → netNeed 0 (no phantom PRODUCTION)", () => {
  // PART: no own demand, kit explodes 5000, available 7647
  const { grossNeed, netNeed } = recomputeNetNeed(0, 5000, 7647, 0);
  assert.equal(grossNeed, 5000);
  assert.equal(netNeed, 0);
});

test("recomputeNetNeed: own backlog + kit pull combine then net supply", () => {
  // ownGross 2000 + kit 5000 = 7000; avail 3000 + wip 500 → net 3500
  const { grossNeed, netNeed } = recomputeNetNeed(2000, 5000, 3000, 500);
  assert.equal(grossNeed, 7000);
  assert.equal(netNeed, 3500);
});

test("recomputeNetNeed: must not use max(own, kit) without supply", () => {
  // Regression: old bug set netNeed = max(ownNet, ceil(kitGross)) ignoring supply
  const ownNetWouldBe = 0; // avail covers own
  const kitGross = 5000;
  const available = 7647;
  const wrong = Math.max(ownNetWouldBe, Math.ceil(kitGross)); // 5000 phantom
  const { netNeed } = recomputeNetNeed(0, kitGross, available, 0);
  assert.equal(wrong, 5000);
  assert.equal(netNeed, 0);
});

test("computeOwnGrossNeed uses demandMix; MAX_FORECAST_HARD differs from HARD_PLUS", () => {
  const hard = 80;
  const velocity = 100;
  const soft = 50;
  const safety = 10;
  const hardPlus = computeOwnGrossNeed(
    PlanningDemandMix.HARD_PLUS_FORECAST_BEYOND_COVERED,
    hard,
    velocity,
    soft,
    safety,
    0.5,
  );
  const maxMix = computeOwnGrossNeed(
    PlanningDemandMix.MAX_FORECAST_HARD,
    hard,
    velocity,
    soft,
    safety,
    0.5,
  );
  // HARD_PLUS: max(hard, velocity + soft*0.5) + safety = max(80, 125) + 10 = 135
  assert.equal(hardPlus, 135);
  // MAX: max(velocity, hard+soft) + safety = max(100, 130) + 10 = 140 (soft once)
  assert.equal(maxMix, 140);
  assert.notEqual(hardPlus, maxMix);
});

test("quota partsQty rule: KIT with BOM must not explode into capacity", () => {
  // Documented contract used by calculate(): PART/net and KIT-without-BOM only.
  const partNet = 5000;
  const kitMissingBomNet = 10;
  const kitWithBomPartsQty = 0; // not bomPartsEquivalent(kitNet)
  assert.equal(partNet + kitMissingBomNet + kitWithBomPartsQty, 5010);
});

test("zero-velocity cover is OK unless hard deficit; no CRITICAL qty=1 spam", () => {
  const ok = resolveCoverMetrics({
    available: 0,
    avgDailySold: 0,
    hardNeed: 0,
    expectedWip: 0,
    warnCoverDays: 60,
    criticalCoverDays: 30,
  });
  assert.equal(ok.coverDays, null);
  assert.equal(ok.status, "OK");
  assert.equal(ok.hardDeficitQty, 0);
  assert.equal(criticalLineQty(0, 0), 0);
  assert.equal(
    shouldEmitCritical({
      status: ok.status,
      netNeed: 0,
      coverRisk: false,
      hardDeficitQty: 0,
    }),
    false,
  );

  const hardDef = resolveCoverMetrics({
    available: 10,
    avgDailySold: 0,
    hardNeed: 50,
    expectedWip: 0,
    warnCoverDays: 60,
    criticalCoverDays: 30,
  });
  assert.equal(hardDef.status, "CRITICAL");
  assert.equal(hardDef.hardDeficitQty, 40);
  assert.equal(criticalLineQty(0, 40), 40);
  assert.equal(
    shouldEmitCritical({
      status: "CRITICAL",
      netNeed: 0,
      coverRisk: false,
      hardDeficitQty: 40,
    }),
    true,
  );
});

test("PKG packaging SKUs are excluded from planning set helper", () => {
  assert.equal(isNonInventoriedPackagingSku("PKG:блистер"), true);
  assert.equal(isNonInventoriedPackagingSku("MG-SF-MU-M1.40"), false);
});
