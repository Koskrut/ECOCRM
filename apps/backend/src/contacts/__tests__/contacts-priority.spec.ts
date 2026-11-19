import assert from "node:assert/strict";
import test from "node:test";
import { ContactsPriorityService } from "../contacts-priority.service";
import type { ContactScoringSignal } from "../types/contacts-priority.types";

function signal(overrides: Partial<ContactScoringSignal> = {}): ContactScoringSignal {
  return {
    contactId: "c1",
    daysSinceCreated: 120,
    lastContactAt: null,
    lastOrderAt: null,
    daysSinceLastContact: 21,
    daysSinceLastOrder: 100,
    hasOrderHistory: true,
    overdueFollowupTasks: 0,
    openTasksCount: 0,
    debtAmount: 0,
    revenue30: 0,
    revenue90: 0,
    revenue365: 0,
    ordersCount30: 0,
    ordersCount90: 0,
    ordersCount365: 2,
    avgCheck90: 0,
    avgCheck365: 0,
    isNewLeadNoFirstContact: false,
    isDormant: true,
    isAtRisk: true,
    ...overrides,
  };
}

test("priority cap lowers the score without dropping list reasons", () => {
  const result = new ContactsPriorityService().score(signal());

  assert.equal(result.score, 50);
  for (const code of [
    "NO_CONTACT_14_DAYS",
    "NO_ORDER_30_DAYS",
    "RETURN_TO_WORK",
    "AT_RISK",
    "DORMANT",
  ]) {
    assert.ok(result.reasons.includes(code), `missing ${code}`);
  }
  assert.ok(result.breakdown.every((entry) => entry.value > 0));
  assert.ok(!result.breakdown.some((entry) => entry.code === "NO_CONTACT_14_DAYS"));
  assert.ok(result.breakdown.some((entry) => entry.code === "AT_RISK"));
});
