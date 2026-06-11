import assert from "node:assert/strict";
import test from "node:test";
import {
  computeFinancialStatusFromOrder,
  financialDueSoonWhere,
  financialOverdueWhere,
  legacyStatusesForOrderStage,
  legacyStatusesForOrderStages,
  legacyStatusToOrderStage,
} from "../order-status-sync.mapper";

test("IN_WORK maps to CONFIRMED", () => {
  assert.equal(legacyStatusToOrderStage("IN_WORK"), "CONFIRMED");
});

test("legacyStatusesForOrderStage(CONFIRMED) includes IN_WORK", () => {
  assert.deepEqual(legacyStatusesForOrderStage("CONFIRMED"), ["IN_WORK"]);
});

test("legacyStatusesForOrderStages includes IN_WORK when CONFIRMED requested", () => {
  const statuses = legacyStatusesForOrderStages(["CONFIRMED", "READY_TO_SHIP"]);
  assert.ok(statuses.includes("IN_WORK"));
  assert.ok(statuses.includes("READY_TO_SHIP"));
});

test("computeFinancialStatusFromOrder: deferred debt overdue by Kyiv calendar day", () => {
  const asOf = new Date("2026-06-10T12:00:00.000Z");
  const status = computeFinancialStatusFromOrder({
    paymentType: "DEFERRED",
    totalAmount: 1000,
    paidAmount: 0,
    debtAmount: 1000,
    paymentDueDate: new Date("2026-06-01T12:00:00.000Z"),
    orderStage: "SHIPPED",
    asOf,
  });
  assert.equal(status, "OVERDUE");
});

test("computeFinancialStatusFromOrder: due within 3 Kyiv days is DUE_SOON", () => {
  const asOf = new Date("2026-06-10T12:00:00.000Z");
  const status = computeFinancialStatusFromOrder({
    paymentType: "DEFERRED",
    totalAmount: 500,
    paidAmount: 0,
    debtAmount: 500,
    paymentDueDate: new Date("2026-06-12T21:00:00.000Z"),
    orderStage: "SHIPPED",
    asOf,
  });
  assert.equal(status, "DUE_SOON");
});

test("computeFinancialStatusFromOrder: fully paid in-progress order is PAID not CLOSED", () => {
  const status = computeFinancialStatusFromOrder({
    paymentType: "DEFERRED",
    totalAmount: 1000,
    paidAmount: 1000,
    debtAmount: 0,
    paymentDueDate: new Date("2026-06-20T00:00:00.000Z"),
    orderStage: "SHIPPED",
  });
  assert.equal(status, "PAID");
});

test("computeFinancialStatusFromOrder: completed with no debt is CLOSED", () => {
  const status = computeFinancialStatusFromOrder({
    paymentType: "DEFERRED",
    totalAmount: 1000,
    paidAmount: 1000,
    debtAmount: 0,
    orderStage: "COMPLETED",
  });
  assert.equal(status, "CLOSED");
});

test("financialOverdueWhere uses paymentDueDate not stored financialStatus", () => {
  const where = financialOverdueWhere(new Date("2026-06-10T12:00:00.000Z"));
  assert.deepEqual(where.debtAmount, { gt: 0 });
  assert.ok(where.paymentDueDate);
});

test("financialDueSoonWhere uses paymentDueDate window", () => {
  const where = financialDueSoonWhere(new Date("2026-06-10T12:00:00.000Z"));
  assert.ok("paymentDueDate" in where);
});
