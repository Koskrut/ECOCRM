import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUDIT_SKIP_MODELS,
  buildAuditLogPayload,
  buildOrderAuditSnapshots,
  resolveAuditRetentionDays,
  shouldSkipAuditModel,
} from "../audit-payload";

describe("audit-payload", () => {
  it("skips sync models and AuditLog", () => {
    for (const model of AUDIT_SKIP_MODELS) {
      assert.equal(shouldSkipAuditModel(model), true);
    }
    assert.equal(shouldSkipAuditModel("AuditLog"), true);
    assert.equal(shouldSkipAuditModel(undefined), true);
    assert.equal(shouldSkipAuditModel("Order"), false);
    assert.equal(shouldSkipAuditModel("Contact"), false);
  });

  it("Order payload keeps only diff without before/after snapshots", () => {
    const payload = buildAuditLogPayload({
      entityType: "Order",
      entityId: "ord_1",
      action: "UPDATE",
      changedBy: "user_1",
      beforeRedacted: {
        id: "ord_1",
        orderStage: "NEW",
        totalAmount: 100,
        syncedAt: "2020-01-01T00:00:00.000Z",
        legacyRaw: { x: 1 },
      },
      afterRedacted: {
        id: "ord_1",
        orderStage: "SHIPPED",
        totalAmount: 100,
        syncedAt: "2020-01-02T00:00:00.000Z",
        legacyRaw: { x: 1 },
      },
      diff: null,
    });

    assert.equal(payload.before, null);
    assert.equal(payload.after, null);
    assert.ok(Array.isArray(payload.diff));
    const fields = (payload.diff as Array<{ field: string }>).map((d) => d.field);
    assert.ok(fields.includes("orderStage"));
    assert.ok(!fields.includes("syncedAt"));
    assert.ok(!fields.includes("legacyRaw"));
    assert.ok(!fields.includes("totalAmount"));
  });

  it("Order CREATE builds per-field diff from empty before", () => {
    const snapshots = buildOrderAuditSnapshots("CREATE", null, {
      id: "ord_2",
      orderNumber: "A-1",
      orderStage: "NEW",
      createdAt: "2020-01-01T00:00:00.000Z",
    });
    assert.equal(snapshots.before, null);
    assert.equal(snapshots.after, null);
    assert.ok(snapshots.diff);
    const fields = snapshots.diff.map((d) => d.field);
    assert.ok(fields.includes("orderNumber"));
    assert.ok(fields.includes("orderStage"));
    assert.ok(!fields.includes("createdAt"));
  });

  it("Contact payload keeps before/after snapshots", () => {
    const payload = buildAuditLogPayload({
      entityType: "Contact",
      entityId: "c1",
      action: "UPDATE",
      changedBy: "user_1",
      beforeRedacted: { id: "c1", fullName: "A" },
      afterRedacted: { id: "c1", fullName: "B" },
      diff: [{ field: "fullName", before: "A", after: "B" }],
    });
    assert.deepEqual(payload.before, { id: "c1", fullName: "A" });
    assert.deepEqual(payload.after, { id: "c1", fullName: "B" });
    assert.ok(Array.isArray(payload.diff));
  });

  it("clamps retention days to 30–90", () => {
    assert.equal(resolveAuditRetentionDays(undefined), 90);
    assert.equal(resolveAuditRetentionDays("60"), 60);
    assert.equal(resolveAuditRetentionDays("7"), 30);
    assert.equal(resolveAuditRetentionDays("120"), 90);
    assert.equal(resolveAuditRetentionDays("nope"), 90);
  });
});
