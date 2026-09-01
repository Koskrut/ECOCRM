import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildOrderOverduePaymentsWhere,
  buildStuckOrdersBaseWhere,
  filterStuckOrders,
  getStuckCutoff,
  isOrderStuck,
  shouldPrePaginateStuckIds,
} from "../orders-attention.util";
import { resolvePresetPeriod } from "../../analytics/utils/analytics-date.util";

describe("orders-attention.util", () => {
  it("buildOrderOverduePaymentsWhere uses paymentDueDate overdue logic and excludes closed stages", () => {
    const where = buildOrderOverduePaymentsWhere({}, new Date("2026-06-10T12:00:00.000Z"));
    assert.ok(where.AND);
    const and = where.AND as Array<Record<string, unknown>>;
    assert.ok(and[0]?.debtAmount);
    assert.ok(and[0]?.paymentDueDate);
    assert.ok(and[1]?.OR);
    const stageOr = and[1]?.OR as Array<{ orderStage?: unknown }>;
    assert.ok(stageOr.some((clause) => clause.orderStage && typeof clause.orderStage === "object"));
  });

  it("buildOrderOverduePaymentsWhere applies owner scope", () => {
    const where = buildOrderOverduePaymentsWhere({ managerId: "mgr-1" });
    assert.ok(where.AND);
    const and = where.AND as Array<{ ownerId?: string }>;
    assert.equal(and[2]?.ownerId, "mgr-1");
  });

  it("buildStuckOrdersBaseWhere limits to period and active stages", () => {
    const period = resolvePresetPeriod("month");
    const where = buildStuckOrdersBaseWhere(period, { managerId: "mgr-1" });
    assert.equal(where.ownerId, "mgr-1");
    assert.ok(where.createdAt);
    assert.ok(where.OR);
  });

  it("isOrderStuck uses last status history or updatedAt", () => {
    const asOf = new Date("2026-06-10T12:00:00.000Z");
    const cutoff = getStuckCutoff(asOf);
    const old = new Date(cutoff.getTime() - 86400000);
    const recent = new Date(cutoff.getTime() + 86400000);
    assert.equal(
      isOrderStuck({ id: "1", updatedAt: recent, statusHistory: [{ createdAt: old }] }, asOf),
      true,
    );
    assert.equal(
      isOrderStuck({ id: "2", updatedAt: old, statusHistory: [] }, asOf),
      true,
    );
    assert.equal(
      isOrderStuck({ id: "3", updatedAt: recent, statusHistory: [{ createdAt: recent }] }, asOf),
      false,
    );
  });

  it("shouldPrePaginateStuckIds is false when a kanban column filter is present", () => {
    assert.equal(shouldPrePaginateStuckIds({}), true);
    assert.equal(shouldPrePaginateStuckIds({ orderStages: "NEW" }), false);
    assert.equal(shouldPrePaginateStuckIds({ orderStage: "NEW" }), false);
    assert.equal(shouldPrePaginateStuckIds({ financialStatus: "OVERDUE" }), false);
    assert.equal(shouldPrePaginateStuckIds({ orderStages: "  " }), true);
  });

  it("filterStuckOrders returns only stuck rows", () => {
    const asOf = new Date("2026-06-10T12:00:00.000Z");
    const cutoff = getStuckCutoff(asOf);
    const old = new Date(cutoff.getTime() - 1000);
    const rows = [
      { id: "a", updatedAt: old, statusHistory: [] },
      { id: "b", updatedAt: new Date(), statusHistory: [{ createdAt: new Date() }] },
    ];
    const stuck = filterStuckOrders(rows, asOf);
    assert.deepEqual(stuck.map((r) => r.id), ["a"]);
  });
});
