import assert from "node:assert/strict";
import test from "node:test";
import type { EmployeeDailyActivityRow } from "../employee-daily-activity.types";
import {
  auditLooksLikeTtnChange,
  classifyTaskTitle,
  computeActionCount,
  computePresenceStatus,
  isAuditNoise,
  overlapActiveSeconds,
  sortActivityRows,
} from "../employee-daily-activity.util";

test("overlapActiveSeconds clips session to day bounds", () => {
  const from = new Date("2026-06-30T00:00:00.000Z");
  const to = new Date("2026-06-30T23:59:59.999Z");
  const seconds = overlapActiveSeconds(
    {
      startedAt: new Date("2026-06-29T22:00:00.000Z"),
      lastSeenAt: new Date("2026-06-30T02:00:00.000Z"),
      activeSeconds: 3600,
    },
    from,
    to,
  );
  assert.ok(seconds > 0);
  assert.ok(seconds <= 3600);
});

test("computePresenceStatus: online when recent heartbeat", () => {
  const now = new Date("2026-06-30T12:00:00.000Z");
  const status = computePresenceStatus(new Date("2026-06-30T11:59:30.000Z"), 100, now);
  assert.equal(status, "online");
});

test("computePresenceStatus: was_today when active but not online", () => {
  const now = new Date("2026-06-30T18:00:00.000Z");
  const status = computePresenceStatus(new Date("2026-06-30T10:00:00.000Z"), 600, now);
  assert.equal(status, "was_today");
});

test("classifyTaskTitle groups payment control and callback", () => {
  assert.equal(classifyTaskTitle("Контроль оплати (Risk playbook)"), "paymentControl");
  assert.equal(classifyTaskTitle("Перезвонить клиенту"), "callback");
  assert.equal(classifyTaskTitle("Нагадати про рахунок"), "other");
});

test("isAuditNoise excludes system and heartbeat entities", () => {
  assert.equal(isAuditNoise("UserActivitySession", "user-1"), true);
  assert.equal(isAuditNoise("Order", "system"), true);
  assert.equal(isAuditNoise("Order", "user-1"), false);
  assert.equal(isAuditNoise("RiskPolicy", "user-1"), true);
});

test("auditLooksLikeTtnChange detects TTN fields", () => {
  assert.equal(auditLooksLikeTtnChange({ documentNumber: "20451503023017" }, null), true);
  assert.equal(auditLooksLikeTtnChange(null, { status: "NEW" }), false);
});

function sampleRow(overrides: Partial<EmployeeDailyActivityRow>): EmployeeDailyActivityRow {
  return {
    userId: "u1",
    fullName: "Test",
    role: "MANAGER",
    leadId: null,
    presence: { status: "absent", firstAt: null, lastAt: null, activeSeconds: 0 },
    payments: { count: 0, amountsByCurrency: {}, uniqueOrders: 0, matchAudits: 0 },
    orders: { createdCount: 0, statusChangedCount: 0, previews: [] },
    shipping: { shipmentCount: 0, ttnCount: 0, ttnNumbers: [] },
    tasks: { created: 0, completed: 0, byTitleGroup: { paymentControl: 0, callback: 0, other: 0 } },
    crm: { activities: 0, contacts: 0, companies: 0, leads: 0, visits: 0 },
    actionCount: 0,
    systemSideEffectsCount: 0,
    ...overrides,
  };
}

test("computeActionCount sums meaningful actions", () => {
  const base = sampleRow({
    payments: { count: 2, amountsByCurrency: { UAH: 100 }, uniqueOrders: 1, matchAudits: 1 },
    orders: { createdCount: 1, statusChangedCount: 1, previews: [] },
    tasks: { created: 1, completed: 3, byTitleGroup: { paymentControl: 2, callback: 0, other: 1 } },
    crm: { activities: 1, contacts: 0, companies: 0, leads: 0, visits: 1 },
    shipping: { shipmentCount: 0, ttnCount: 1, ttnNumbers: [] },
  });
  const count = computeActionCount(base);
  assert.equal(count, 2 + 1 + 1 + 1 + 1 + 3 + 1 + 1 + 1);
});

test("sortActivityRows by payments descending", () => {
  const rows = [
    sampleRow({ userId: "a", fullName: "A", payments: { count: 1, amountsByCurrency: { UAH: 10 }, uniqueOrders: 1, matchAudits: 0 }, actionCount: 1 }),
    sampleRow({ userId: "b", fullName: "B", payments: { count: 1, amountsByCurrency: { UAH: 100 }, uniqueOrders: 1, matchAudits: 0 }, actionCount: 1 }),
  ];
  const sorted = sortActivityRows(rows, "payments");
  assert.equal(sorted[0]?.userId, "b");
});
