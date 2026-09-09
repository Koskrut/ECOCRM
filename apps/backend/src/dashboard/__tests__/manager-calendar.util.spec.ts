import assert from "node:assert/strict";
import test from "node:test";
import { DateTime } from "luxon";
import { CRM_TIME_ZONE } from "../../crm-timezone";
import {
  buildGrowthLevers,
  clientKeyFromIds,
  coveragePercent,
  enumerateKyivDays,
  forecastFromPace,
  resolveManagerCalendarWindows,
} from "../manager-calendar.util";

test("resolveManagerCalendarWindows uses Kyiv calendar month bounds", () => {
  const now = DateTime.fromObject(
    { year: 2026, month: 9, day: 9, hour: 12 },
    { zone: CRM_TIME_ZONE },
  ).toJSDate();
  const windows = resolveManagerCalendarWindows(now);

  assert.equal(windows.daysElapsed, 9);
  assert.equal(windows.daysInMonth, 30);
  assert.equal(windows.daysRemaining, 21);

  const curFrom = DateTime.fromJSDate(windows.currentMonthToDate.from).setZone(CRM_TIME_ZONE);
  const curTo = DateTime.fromJSDate(windows.currentMonthToDate.to).setZone(CRM_TIME_ZONE);
  assert.equal(curFrom.toISODate(), "2026-09-01");
  assert.equal(curTo.toISODate(), "2026-09-09");

  const fullFrom = DateTime.fromJSDate(windows.previousMonthFull.from).setZone(CRM_TIME_ZONE);
  const fullTo = DateTime.fromJSDate(windows.previousMonthFull.to).setZone(CRM_TIME_ZONE);
  assert.equal(fullFrom.toISODate(), "2026-08-01");
  assert.equal(fullTo.toISODate(), "2026-08-31");

  const paceTo = DateTime.fromJSDate(windows.previousMonthPace.to).setZone(CRM_TIME_ZONE);
  assert.equal(paceTo.toISODate(), "2026-08-09");
});

test("resolveManagerCalendarWindows caps pace day on shorter previous month", () => {
  const now = DateTime.fromObject(
    { year: 2026, month: 3, day: 31, hour: 10 },
    { zone: CRM_TIME_ZONE },
  ).toJSDate();
  const windows = resolveManagerCalendarWindows(now);
  const paceTo = DateTime.fromJSDate(windows.previousMonthPace.to).setZone(CRM_TIME_ZONE);
  assert.equal(paceTo.toISODate(), "2026-02-28");
});

test("coveragePercent and forecastFromPace handle edge cases", () => {
  assert.equal(coveragePercent(12, 100), 12);
  assert.equal(coveragePercent(1, 0), 0);
  assert.equal(forecastFromPace(900, 9, 30), 3000);
  assert.equal(forecastFromPace(100, 0, 30), null);
});

test("clientKeyFromIds prefers clientId then contactId", () => {
  assert.equal(clientKeyFromIds("c1", "ct1"), "c1");
  assert.equal(clientKeyFromIds(null, "ct1"), "ct1");
  assert.equal(clientKeyFromIds(null, null), null);
});

test("enumerateKyivDays zero-fills inclusive range", () => {
  const from = DateTime.fromObject(
    { year: 2026, month: 9, day: 1 },
    { zone: CRM_TIME_ZONE },
  )
    .startOf("day")
    .toJSDate();
  const to = DateTime.fromObject(
    { year: 2026, month: 9, day: 3 },
    { zone: CRM_TIME_ZONE },
  )
    .endOf("day")
    .toJSDate();
  assert.deepEqual(enumerateKyivDays({ from, to }), [
    "2026-09-01",
    "2026-09-02",
    "2026-09-03",
  ]);
});

test("buildGrowthLevers prioritizes overdue snapshot and overdue payments", () => {
  const levers = buildGrowthLevers({
    coveragePct: 10,
    coveragePctPace: 25,
    conversionPct: 20,
    conversionPctPrior: 22,
    avgCheck: 200,
    avgCheckPrior: 250,
    overduePayments: 12,
    overdueFollowups: 12,
    overdueTasks: 3,
    unshippedBase: 80,
  });

  assert.ok(levers.length >= 3);
  assert.equal(levers[0].key, "overdue");
  assert.equal(levers[0].status, "critical");
  assert.ok(levers.some((l) => l.key === "coverage" && l.status === "critical"));
  const collection = levers.find((l) => l.key === "collection");
  assert.ok(collection);
  assert.equal(collection.unit, "count");
  assert.equal(collection.currentValue, 12);
});

test("buildGrowthLevers returns only good levers when nothing is wrong", () => {
  const levers = buildGrowthLevers({
    coveragePct: 40,
    coveragePctPace: 30,
    conversionPct: 25,
    conversionPctPrior: 20,
    avgCheck: 300,
    avgCheckPrior: 250,
    overduePayments: 0,
    overdueFollowups: 0,
    overdueTasks: 0,
    unshippedBase: 10,
  });
  assert.ok(levers.every((l) => l.status === "good"));
});
