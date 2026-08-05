import test from "node:test";
import assert from "node:assert/strict";
import { PlanningRunLineType } from "@prisma/client";
import { computeDesiredDate } from "../mrp-desired-date.util";

const now = new Date("2026-08-05T12:00:00.000Z");

test("hard deficit month 0 uses production lead days", () => {
  const d = computeDesiredDate({
    now,
    monthOffset: 0,
    hasHardDeficit: true,
    productionLeadDays: 14,
    lineType: PlanningRunLineType.PRODUCTION,
  });
  assert.equal(d, "2026-08-19");
});

test("pack lines use pack lead days", () => {
  const d = computeDesiredDate({
    now,
    packLeadDays: 3,
    lineType: PlanningRunLineType.CAN_PACK,
  });
  assert.equal(d, "2026-08-08");
});

test("month offset pushes date to future month", () => {
  const d = computeDesiredDate({
    now,
    monthOffset: 2,
    productionLeadDays: 14,
    lineType: PlanningRunLineType.PRODUCTION,
  });
  assert.equal(d, "2026-10-01");
});
