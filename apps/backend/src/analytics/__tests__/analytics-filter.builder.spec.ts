import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import {
  bookedOrderStageClause,
  buildPeriodOrderWhere,
  buildPeriodPipelineOrderWhere,
  pipelineOrderStageClause,
} from "../utils/analytics-filter.builder";
import {
  ANALYTICS_BOOKED_EXCLUDED_ORDER_STAGES,
  ANALYTICS_EXCLUDED_ORDER_STAGES,
} from "../analytics.constants";

const actor = {
  id: "u1",
  email: "a@test.local",
  fullName: "A",
  role: UserRole.ADMIN,
};

test("ANALYTICS_BOOKED_EXCLUDED includes pre-ship and voids", () => {
  for (const s of ["CANCELED", "REFUSED", "NEW", "AWAITING_PAYMENT", "AWAITING_STOCK", "CONFIRMED"]) {
    assert.ok(
      (ANALYTICS_BOOKED_EXCLUDED_ORDER_STAGES as readonly string[]).includes(s),
      `expected ${s} in booked exclusions`,
    );
  }
  assert.equal(
    (ANALYTICS_BOOKED_EXCLUDED_ORDER_STAGES as readonly string[]).includes("READY_TO_SHIP"),
    false,
  );
  assert.equal(
    (ANALYTICS_EXCLUDED_ORDER_STAGES as readonly string[]).includes("AWAITING_STOCK"),
    false,
  );
});

test("bookedOrderStageClause keeps null and READY_TO_SHIP+", () => {
  const clause = bookedOrderStageClause();
  assert.ok(Array.isArray(clause.OR));
  assert.equal(clause.OR?.length, 2);
});

test("buildPeriodOrderWhere uses booked exclusions", () => {
  const from = new Date("2026-11-01T00:00:00Z");
  const to = new Date("2026-11-30T23:59:59Z");
  const where = buildPeriodOrderWhere(from, to, { actor });
  assert.deepEqual(where.createdAt, { gte: from, lte: to });
  const notIn = (where.OR?.[0] as { orderStage?: { notIn?: string[] } })?.orderStage?.notIn ?? [];
  assert.ok(notIn.includes("NEW"));
  assert.ok(notIn.includes("AWAITING_STOCK"));
  assert.ok(notIn.includes("CANCELED"));
  assert.ok(!notIn.includes("SHIPPED"));
});

test("buildPeriodPipelineOrderWhere excludes voids only", () => {
  const from = new Date("2026-11-01T00:00:00Z");
  const to = new Date("2026-11-30T23:59:59Z");
  const where = buildPeriodPipelineOrderWhere(from, to, { actor, managerId: "m1" });
  assert.equal(where.ownerId, "m1");
  const notIn = (where.OR?.[0] as { orderStage?: { notIn?: string[] } })?.orderStage?.notIn ?? [];
  assert.deepEqual(notIn, [...ANALYTICS_EXCLUDED_ORDER_STAGES]);
  assert.ok(!notIn.includes("NEW"));
  assert.ok(!notIn.includes("AWAITING_STOCK"));
});

test("pipelineOrderStageClause differs from booked", () => {
  const booked = bookedOrderStageClause().OR?.[0] as { orderStage: { notIn: string[] } };
  const pipeline = pipelineOrderStageClause().OR?.[0] as { orderStage: { notIn: string[] } };
  assert.ok(booked.orderStage.notIn.length > pipeline.orderStage.notIn.length);
});
