import test from "node:test";
import assert from "node:assert/strict";
import { PlanningRunLineType } from "@prisma/client";
import { PlanningRunService } from "../planning-run.service";

test("sumQuotaUsedMonth0 uses month0Qty not partsQty", () => {
  const used = PlanningRunService.sumQuotaUsedMonth0([
    {
      lineType: PlanningRunLineType.PRODUCTION,
      monthBucket: 0,
      details: { partsQty: 9000, month0Qty: 5000 },
    },
    {
      lineType: PlanningRunLineType.SEMI_REORDER,
      monthBucket: 0,
      details: { partsQty: 4000, month0Qty: 2000 },
    },
    {
      lineType: PlanningRunLineType.PRODUCTION,
      monthBucket: 1,
      details: { partsQty: 3000, month0Qty: 0 },
    },
    {
      lineType: PlanningRunLineType.CRITICAL,
      monthBucket: 0,
      details: { partsQty: 999, month0Qty: 999 },
    },
  ]);
  // 5000 + 2000 — ignores partsQty and CRITICAL and monthBucket>0
  assert.equal(used, 7000);
});

test("sumQuotaUsedMonth0 falls back to 0 when month0Qty missing", () => {
  const used = PlanningRunService.sumQuotaUsedMonth0([
    {
      lineType: PlanningRunLineType.PRODUCTION,
      monthBucket: 0,
      details: { partsQty: 5000 },
    },
  ]);
  assert.equal(used, 0);
});
