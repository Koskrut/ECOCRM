import test from "node:test";
import assert from "node:assert/strict";
import { PlanningDemandMix } from "@prisma/client";
import {
  assignParetoClasses,
  assignPile,
  computeCoverTarget,
  computeKitPositionPlan,
  computeWeeklyPackNeed,
  coverTone,
  groupSharedBottlenecks,
  sortEndingKits,
  suggestedPackQty,
  suggestedPackTargetQty,
  weeksOfCover,
} from "../kit-portfolio.util";

test("weeksOfCover is null when there are no sales", () => {
  assert.equal(weeksOfCover(200, 0), null);
});

test("weeksOfCover uses 30-day months", () => {
  assert.equal(weeksOfCover(60, 30), 8.6);
});

test("no sales and leftover → idle, not ending", () => {
  assert.deepEqual(
    assignPile({
      avgMonthlySold: 0,
      stockFinished: 200,
      maxBuildNow: 0,
      hardNeed: 0,
      weeksOfCover: null,
      warnWeeks: 8,
    }),
    { pile: "idle", endingReason: null },
  );
});

test("uncovered hard orders beat idle even with no sales", () => {
  assert.deepEqual(
    assignPile({
      avgMonthlySold: 0,
      stockFinished: 2,
      maxBuildNow: 0,
      hardNeed: 10,
      weeksOfCover: null,
      warnWeeks: 8,
    }),
    { pile: "ending", endingReason: "orders" },
  );
});

test("assignPile splits orders vs cover ending reasons", () => {
  assert.deepEqual(
    assignPile({
      avgMonthlySold: 40,
      stockFinished: 80,
      maxBuildNow: 20,
      hardNeed: 100,
      weeksOfCover: 12,
      warnWeeks: 8,
    }),
    { pile: "ending", endingReason: "orders" },
  );
  assert.deepEqual(
    assignPile({
      avgMonthlySold: 40,
      stockFinished: 5,
      maxBuildNow: 0,
      hardNeed: 0,
      weeksOfCover: 1,
      warnWeeks: 8,
    }),
    { pile: "ending", endingReason: "cover" },
  );
});

test("important kit with 1 week of stock → ending (cover)", () => {
  assert.equal(
    assignPile({
      avgMonthlySold: 40,
      stockFinished: 5,
      maxBuildNow: 0,
      hardNeed: 0,
      weeksOfCover: 1,
      warnWeeks: 8,
    }).pile,
    "ending",
  );
});

test("enough weeks of stock → ok", () => {
  assert.deepEqual(
    assignPile({
      avgMonthlySold: 10,
      stockFinished: 80,
      maxBuildNow: 20,
      hardNeed: 0,
      weeksOfCover: 12,
      warnWeeks: 8,
    }),
    { pile: "ok", endingReason: null },
  );
});

test("computeWeeklyPackNeed matches packing targetPack formula", () => {
  const need = computeWeeklyPackNeed({
    hardNeed: 50,
    forecastNeed: 80,
    softNeed: 0,
    stockKits: 12,
    demandMix: PlanningDemandMix.HARD_PLUS_FORECAST_BEYOND_COVERED,
  });
  assert.equal(need, 80 - 12);
});

test("suggestedPackTargetQty is absolute qty in request (10.045 case)", () => {
  assert.equal(
    suggestedPackTargetQty({
      weeklyPackNeed: 3,
      maxBuildNow: 3,
      alreadyInRequest: 3,
      weekCapacityLeft: 500,
    }),
    3,
  );
  assert.equal(
    suggestedPackQty({
      weeklyPackNeed: 3,
      maxBuildNow: 3,
      alreadyInRequest: 3,
      weekCapacityLeft: 500,
    }),
    0,
  );
});

test("suggested pack respects parts cap and week room", () => {
  assert.equal(
    suggestedPackTargetQty({
      weeklyPackNeed: 14,
      maxBuildNow: 40,
      alreadyInRequest: 0,
      weekCapacityLeft: 9,
    }),
    9,
  );
  assert.equal(
    suggestedPackQty({
      weeklyPackNeed: 14,
      maxBuildNow: 0,
      alreadyInRequest: 0,
      weekCapacityLeft: 2000,
    }),
    0,
  );
});

test("computeKitPositionPlan uses weekly pack need not MRP cover", () => {
  const plan = computeKitPositionPlan({
    stockFinished: 12,
    maxBuildNow: 15,
    weeklyPackNeed: 138,
    coverTarget: 40,
    alreadyInRequest: 0,
  });
  assert.equal(plan.coverTarget, 40);
  assert.equal(plan.targetStock, 138);
  assert.equal(plan.stockNow, 12);
  assert.equal(plan.packGap, 138);
  assert.equal(plan.canPackNow, 15);
  assert.equal(plan.toWork, 123);
});

test("computeKitPositionPlan alreadyInRequest reduces packGap", () => {
  const plan = computeKitPositionPlan({
    stockFinished: 5,
    maxBuildNow: 40,
    weeklyPackNeed: 14,
    alreadyInRequest: 10,
  });
  assert.equal(plan.packGap, 4);
  assert.equal(plan.canPackNow, 4);
  assert.equal(plan.toWork, 0);
});

test("computeCoverTarget for MRP tooltip", () => {
  assert.equal(computeCoverTarget({ avgMonthlySold: 10, warnWeeks: 8 }), 19);
});

test("empty catalog and zero revenue stay class C", () => {
  assert.deepEqual(assignParetoClasses([]), []);
  const [only] = assignParetoClasses([{ id: "a", revenue: 100 }]);
  assert.equal(only?.paretoClass, "A");
});

test("ending sort: packable today first, then worst weeks", () => {
  const sorted = sortEndingKits([
    { id: "blocked", maxBuildNow: 0, weeksOfCover: 0.5, revenue: 100 },
    { id: "pack", maxBuildNow: 40, weeksOfCover: 1, revenue: 50 },
  ]);
  assert.deepEqual(sorted.map((r) => r.id), ["pack", "blocked"]);
});

test("shared bottleneck groups 4 kits on one part", () => {
  const groups = groupSharedBottlenecks(
    [
      {
        productId: "k1",
        pile: "ending",
        maxBuildNow: 0,
        bottleneckComponentId: "p1",
        bottleneckSku: "VAL-12",
        bottleneckName: "Вал 12",
        bottleneckQtyPerKit: 1,
        suggestedPackIgnoringParts: 40,
      },
      {
        productId: "k2",
        pile: "ending",
        maxBuildNow: 0,
        bottleneckComponentId: "p1",
        bottleneckSku: "VAL-12",
        bottleneckName: "Вал 12",
        bottleneckQtyPerKit: 1,
        suggestedPackIgnoringParts: 20,
      },
      {
        productId: "k3",
        pile: "ending",
        maxBuildNow: 0,
        bottleneckComponentId: "p1",
        bottleneckSku: "VAL-12",
        bottleneckName: "Вал 12",
        bottleneckQtyPerKit: 1,
        suggestedPackIgnoringParts: 10,
      },
      {
        productId: "k4",
        pile: "ending",
        maxBuildNow: 0,
        bottleneckComponentId: "p1",
        bottleneckSku: "VAL-12",
        bottleneckName: "Вал 12",
        bottleneckQtyPerKit: 1,
        suggestedPackIgnoringParts: 5,
      },
    ],
    new Map([["p1", 0]]),
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.kitCount, 4);
});

test("coverTone critical under 2 weeks", () => {
  assert.equal(coverTone(1, 8, 2), "critical");
});
