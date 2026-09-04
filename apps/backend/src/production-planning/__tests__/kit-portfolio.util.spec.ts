import test from "node:test";
import assert from "node:assert/strict";
import { PlanningDemandMix } from "@prisma/client";
import {
  assignParetoClasses,
  assignPile,
  assignXyzClass,
  computeCoverTarget,
  computeIdealProducePlan,
  applyMinProduceLot,
  computeKitPositionPlan,
  computeWeeklyPackNeed,
  coverTone,
  fillPeriodSeries,
  groupSharedBottlenecks,
  isOpenPackingStatus,
  recentIsoWeekKeys,
  recentYearMonthKeys,
  remainingPackQty,
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

test("computeIdealProducePlan fills gap to coverTarget using parts first", () => {
  // Ideal 74, stock 0, can build 107 → pack all 74 from parts, produce 0
  const fullParts = computeIdealProducePlan({
    stockFinished: 0,
    maxBuildNow: 107,
    coverTarget: 74,
  });
  assert.equal(fullParts.gapToIdeal, 74);
  assert.equal(fullParts.canPackNow, 74);
  assert.equal(fullParts.toWork, 0);

  // Ideal 915, stock 275, can build 100 → pack 100, produce 540
  const shortParts = computeIdealProducePlan({
    stockFinished: 275,
    maxBuildNow: 100,
    coverTarget: 915,
  });
  assert.equal(shortParts.gapToIdeal, 640);
  assert.equal(shortParts.canPackNow, 100);
  assert.equal(shortParts.toWork, 540);

  // Already at/above ideal
  const ok = computeIdealProducePlan({
    stockFinished: 57,
    maxBuildNow: 265,
    coverTarget: 59,
  });
  assert.equal(ok.gapToIdeal, 2);
  assert.equal(ok.canPackNow, 2);
  assert.equal(ok.toWork, 0);
});

test("applyMinProduceLot rounds up when any production is needed", () => {
  assert.equal(applyMinProduceLot(0, 200), 0);
  assert.equal(applyMinProduceLot(50, 200), 200);
  assert.equal(applyMinProduceLot(250, 200), 250);
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

test("assignXyzClass marks stable low CV as X", () => {
  const series = Array(26).fill(10);
  const r = assignXyzClass(series, { source: "crm_weeks" });
  assert.equal(r.xyzClass, "X");
  assert.equal(r.xyzReason, "stable");
  assert.equal(r.xyzSource, "crm_weeks");
});

test("assignXyzClass marks high CV as Z", () => {
  const series = [...Array(13).fill(1), ...Array(13).fill(40)];
  const r = assignXyzClass(series, { source: "crm_weeks" });
  assert.equal(r.xyzClass, "Z");
  assert.ok((r.demandCv ?? 0) > 0.5);
});

test("assignXyzClass intermittent when mostly zeros", () => {
  const series = Array(26).fill(0);
  series[0] = 20;
  series[10] = 5;
  const r = assignXyzClass(series, { source: "crm_weeks" });
  assert.equal(r.xyzClass, "Z");
  assert.equal(r.xyzReason, "intermittent");
});

test("assignXyzClass insufficient history", () => {
  const r = assignXyzClass([1, 2, 3], { source: "crm_weeks" });
  assert.equal(r.xyzClass, null);
  assert.equal(r.xyzReason, "insufficient_history");
});

test("fillPeriodSeries zero-fills missing keys", () => {
  assert.deepEqual(fillPeriodSeries(new Map([["a", 5]]), ["a", "b", "c"]), [5, 0, 0]);
});

test("recentIsoWeekKeys returns requested count", () => {
  assert.equal(recentIsoWeekKeys(new Date("2026-09-02T00:00:00Z"), 26).length, 26);
  assert.equal(recentYearMonthKeys(new Date("2026-09-02T00:00:00Z"), 12).length, 12);
});

test("remainingPackQty subtracts already-in-request from canPack", () => {
  assert.equal(remainingPackQty(100, 40), 60);
  assert.equal(remainingPackQty(100, 100), 0);
  assert.equal(remainingPackQty(100, 150), 0);
  assert.equal(remainingPackQty(0, 10), 0);
});

test("isOpenPackingStatus includes DRAFT and APPROVED, not DONE", () => {
  assert.equal(isOpenPackingStatus("DRAFT"), true);
  assert.equal(isOpenPackingStatus("APPROVED"), true);
  assert.equal(isOpenPackingStatus("DONE"), false);
  assert.equal(isOpenPackingStatus(null), false);
});

test("ideal pack remaining after approved request still tracks gap", () => {
  const ideal = computeIdealProducePlan({
    stockFinished: 12,
    maxBuildNow: 100,
    coverTarget: 450,
  });
  assert.equal(ideal.canPackNow, 100);
  assert.equal(ideal.toWork, 338);
  // After 80 already on APPROVED packing list — still show remaining 20 to pack
  assert.equal(remainingPackQty(ideal.canPackNow, 80), 20);
});
