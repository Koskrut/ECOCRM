import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getAllowedReturnStatusTransitions,
  isMisPickChecklistComplete,
  shouldExcludeReturnFromOrderFinancialSync,
} from "../order-return-mis-pick.utils";

test("mis-pick replacement active excludes return from financial sync", () => {
  assert.equal(
    shouldExcludeReturnFromOrderFinancialSync({
      reason: "WRONG_ITEM",
      status: "INSPECTION",
      outboundWaivedAt: null,
      items: [],
    }),
    true,
  );
  assert.equal(
    shouldExcludeReturnFromOrderFinancialSync({
      reason: "CUSTOMER_CHANGE",
      status: "INSPECTION",
      outboundWaivedAt: null,
      items: [],
    }),
    false,
  );
});

test("mis-pick checklist complete when inbound and outbound done", () => {
  assert.equal(
    isMisPickChecklistComplete({
      reason: "WRONG_ITEM",
      inboundDoneAt: new Date(),
      outboundDoneAt: new Date(),
      inboundWaivedAt: null,
      outboundWaivedAt: null,
      items: [{ disposition: "RESTOCK" }],
    }),
    true,
  );
  assert.equal(
    isMisPickChecklistComplete({
      reason: "WRONG_ITEM",
      inboundDoneAt: null,
      outboundDoneAt: null,
      inboundWaivedAt: null,
      outboundWaivedAt: null,
      items: [{ disposition: "PENDING" }],
    }),
    false,
  );
});

test("INSPECTION can go to CLOSED for mis-pick with replacement", () => {
  const allowed = getAllowedReturnStatusTransitions("INSPECTION", {
    reason: "WRONG_ITEM",
    inboundDoneAt: new Date(),
    outboundDoneAt: new Date(),
    inboundWaivedAt: null,
    outboundWaivedAt: null,
    items: [{ disposition: "RESTOCK" }],
  });
  assert.ok(allowed.includes("CLOSED"));
  assert.ok(!allowed.includes("REFUND_OR_ADJUSTMENT"));
});

test("INSPECTION goes to refund when outbound waived", () => {
  const allowed = getAllowedReturnStatusTransitions("INSPECTION", {
    reason: "WRONG_ITEM",
    inboundDoneAt: new Date(),
    outboundDoneAt: null,
    inboundWaivedAt: null,
    outboundWaivedAt: new Date(),
    items: [{ disposition: "RESTOCK" }],
  });
  assert.ok(allowed.includes("REFUND_OR_ADJUSTMENT"));
});
