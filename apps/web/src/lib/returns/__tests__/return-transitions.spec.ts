import assert from "node:assert/strict";
import test from "node:test";
import {
  getAllowedReturnStatusTransitions,
  getReturnDragTargets,
  isReturnDropAllowed,
  shouldSkipSettlementPreviewOnClose,
} from "../return-transitions";

test("regular INSPECTION only moves to refund/adjustment", () => {
  assert.deepEqual(
    getAllowedReturnStatusTransitions("INSPECTION", { reason: "DEFECT" }),
    ["REFUND_OR_ADJUSTMENT"],
  );
});

test("mis-pick INSPECTION with replacement goes to CLOSED, not refund", () => {
  const allowed = getAllowedReturnStatusTransitions("INSPECTION", {
    reason: "WRONG_ITEM",
    inboundDoneAt: "2026-01-01",
    outboundDoneAt: "2026-01-02",
  });
  assert.ok(allowed.includes("CLOSED"));
  assert.ok(!allowed.includes("REFUND_OR_ADJUSTMENT"));
});

test("mis-pick INSPECTION with outbound waived goes to refund", () => {
  const allowed = getAllowedReturnStatusTransitions("INSPECTION", {
    reason: "WRONG_ITEM",
    inboundDoneAt: "2026-01-01",
    outboundWaivedAt: "2026-01-02",
  });
  assert.ok(allowed.includes("REFUND_OR_ADJUSTMENT"));
  assert.ok(!allowed.includes("CLOSED"));
});

test("warehouse cannot close or refund from the board", () => {
  assert.equal(
    isReturnDropAllowed({ reason: "DEFECT" }, "INSPECTION", "REFUND_OR_ADJUSTMENT", true),
    false,
  );
  assert.equal(
    isReturnDropAllowed({ reason: "DEFECT" }, "RECEIVED_BY_WAREHOUSE", "INSPECTION", true),
    true,
  );
  assert.deepEqual(getReturnDragTargets("CLOSED", { reason: "DEFECT" }, false), []);
});

test("mis-pick replacement close skips settlement preview", () => {
  assert.equal(
    shouldSkipSettlementPreviewOnClose({ reason: "WRONG_ITEM", outboundWaivedAt: null }),
    true,
  );
  assert.equal(
    shouldSkipSettlementPreviewOnClose({ reason: "WRONG_ITEM", outboundWaivedAt: "2026-01-01" }),
    false,
  );
  assert.equal(
    shouldSkipSettlementPreviewOnClose({ reason: "DEFECT", outboundWaivedAt: null }),
    false,
  );
});
