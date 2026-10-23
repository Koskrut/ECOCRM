import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_NOTIFICATION_RULES,
  normalizeNotificationRules,
  saleAssignedDeliveryAllows,
} from "../notification-rules";

describe("notification-rules", () => {
  it("defaults to enabled ALL when missing", () => {
    assert.deepEqual(normalizeNotificationRules(null), DEFAULT_NOTIFICATION_RULES);
    assert.deepEqual(normalizeNotificationRules({}), DEFAULT_NOTIFICATION_RULES);
  });

  it("respects PICKUP filter", () => {
    const rules = normalizeNotificationRules({
      saleAssigned: { enabled: true, deliveryMethods: "PICKUP" },
    });
    assert.equal(saleAssignedDeliveryAllows(rules, "PICKUP"), true);
    assert.equal(saleAssignedDeliveryAllows(rules, "NOVA_POSHTA"), false);
    assert.equal(saleAssignedDeliveryAllows(rules, null), false);
  });

  it("disabled rule blocks all delivery methods", () => {
    const rules = normalizeNotificationRules({
      saleAssigned: { enabled: false, deliveryMethods: "ALL" },
    });
    assert.equal(saleAssignedDeliveryAllows(rules, "PICKUP"), false);
  });
});
