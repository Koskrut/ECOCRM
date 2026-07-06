import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildTaskOverdueWhere, startOfTodayKyiv } from "../tasks-attention.util";

describe("tasks-attention.util", () => {
  it("buildTaskOverdueWhere filters open/in-progress with due before Kyiv today", () => {
    const where = buildTaskOverdueWhere({}, new Date("2026-06-10T12:00:00.000Z"));
    assert.deepEqual(where.status, { in: ["OPEN", "IN_PROGRESS"] });
    assert.ok(where.dueAt);
    const dueAt = where.dueAt as { not: null; lt: Date };
    assert.equal(dueAt.not, null);
    assert.equal(dueAt.lt.toISOString(), startOfTodayKyiv(new Date("2026-06-10T12:00:00.000Z")).toISOString());
  });

  it("buildTaskOverdueWhere applies assignee scope", () => {
    const where = buildTaskOverdueWhere({ managerId: "mgr-1" });
    assert.equal(where.assigneeId, "mgr-1");
  });

  it("buildTaskOverdueWhere applies allowedAssigneeIds", () => {
    const where = buildTaskOverdueWhere({ allowedAssigneeIds: ["a", "b"] });
    assert.deepEqual(where.assigneeId, { in: ["a", "b"] });
  });
});
