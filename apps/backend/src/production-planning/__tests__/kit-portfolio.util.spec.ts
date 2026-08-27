import test from "node:test";
import assert from "node:assert/strict";
import {
  assignParetoClasses,
  assignPile,
  coverTone,
  groupSharedBottlenecks,
  sortEndingKits,
  suggestedPackQty,
  weeksOfCover,
} from "../kit-portfolio.util";

test("weeksOfCover is null when there are no sales", () => {
  assert.equal(weeksOfCover(200, 0), null);
});

test("weeksOfCover uses 30-day months", () => {
  // 60 kits, 30/month → 60 days → ~8.6 weeks
  assert.equal(weeksOfCover(60, 30), 8.6);
});

test("no sales and leftover → idle, not ending", () => {
  assert.equal(
    assignPile({
      avgMonthlySold: 0,
      stockFinished: 200,
      maxBuildNow: 0,
      hardNeed: 0,
      weeksOfCover: null,
      warnWeeks: 8,
    }),
    "idle",
  );
});

test("uncovered hard orders beat idle even with no sales", () => {
  assert.equal(
    assignPile({
      avgMonthlySold: 0,
      stockFinished: 2,
      maxBuildNow: 0,
      hardNeed: 10,
      weeksOfCover: null,
      warnWeeks: 8,
    }),
    "ending",
  );
});

test("important kit with 1 week of stock → ending", () => {
  assert.equal(
    assignPile({
      avgMonthlySold: 40,
      stockFinished: 5,
      maxBuildNow: 0,
      hardNeed: 0,
      weeksOfCover: 1,
      warnWeeks: 8,
    }),
    "ending",
  );
});

test("enough weeks of stock → ok", () => {
  assert.equal(
    assignPile({
      avgMonthlySold: 10,
      stockFinished: 80,
      maxBuildNow: 20,
      hardNeed: 0,
      weeksOfCover: 12,
      warnWeeks: 8,
    }),
    "ok",
  );
});

test("empty catalog and zero revenue stay class C", () => {
  assert.deepEqual(assignParetoClasses([]), []);
  const [only] = assignParetoClasses([{ id: "a", revenue: 100 }]);
  assert.equal(only?.paretoClass, "A");
  assert.equal(only?.inPareto80, true);
  assert.equal(only?.cumulativePct, 100);
});

test("Pareto 80% marks the money-makers A", () => {
  const rows = assignParetoClasses([
    { id: "a", revenue: 80 },
    { id: "b", revenue: 10 },
    { id: "c", revenue: 10 },
    { id: "d", revenue: 0 },
  ]);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId.a?.paretoClass, "A");
  assert.equal(byId.a?.inPareto80, true);
  assert.equal(byId.b?.paretoClass, "B");
  assert.equal(byId.d?.paretoClass, "C");
  assert.equal(byId.d?.inPareto80, false);
});

test("suggested pack qty fills warn cover, capped by parts and week limit", () => {
  // 10/month, 8 weeks → target ceil(10 * 56/30) = 19; stock 5 → gap 14; parts 40; week 9 → 9
  assert.equal(
    suggestedPackQty({
      stockFinished: 5,
      maxBuildNow: 40,
      avgMonthlySold: 10,
      hardNeed: 0,
      warnWeeks: 8,
      alreadyInRequest: 0,
      weekCapacityLeft: 9,
    }),
    9,
  );
  assert.equal(
    suggestedPackQty({
      stockFinished: 5,
      maxBuildNow: 0,
      avgMonthlySold: 10,
      hardNeed: 0,
      warnWeeks: 8,
      alreadyInRequest: 0,
      weekCapacityLeft: 2000,
    }),
    0,
  );
});

test("already in request reduces pack suggestion", () => {
  const qty = suggestedPackQty({
    stockFinished: 0,
    maxBuildNow: 100,
    avgMonthlySold: 30,
    hardNeed: 0,
    warnWeeks: 8,
    alreadyInRequest: 50,
    weekCapacityLeft: 2000,
  });
  assert.ok(qty < 60);
});

test("ending sort: packable today first, then worst weeks", () => {
  const sorted = sortEndingKits([
    { id: "blocked", maxBuildNow: 0, weeksOfCover: 0.5, revenue: 100 },
    { id: "pack", maxBuildNow: 40, weeksOfCover: 1, revenue: 50 },
    { id: "packWorse", maxBuildNow: 10, weeksOfCover: 0.2, revenue: 10 },
  ]);
  assert.deepEqual(
    sorted.map((r) => r.id),
    ["packWorse", "pack", "blocked"],
  );
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
      {
        productId: "ok",
        pile: "ok",
        maxBuildNow: 0,
        bottleneckComponentId: "p1",
        bottleneckSku: "VAL-12",
        bottleneckName: "Вал 12",
        bottleneckQtyPerKit: 1,
        suggestedPackIgnoringParts: 99,
      },
    ],
    new Map([["p1", 0]]),
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.sku, "VAL-12");
  assert.equal(groups[0]?.kitCount, 4);
  assert.equal(groups[0]?.suggestedQty, 75);
});

test("coverTone critical under 2 weeks", () => {
  assert.equal(coverTone(1, 8, 2), "critical");
  assert.equal(coverTone(4, 8, 2), "warn");
  assert.equal(coverTone(12, 8, 2), "ok");
});
