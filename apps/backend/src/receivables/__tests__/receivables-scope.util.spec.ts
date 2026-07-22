import assert from "node:assert/strict";
import { RECEIVABLES_DEBT_ORDER_STAGES } from "../receivables.constants";
import {
  computeReconcileStatus,
  isReceivablesDeltaStatus,
} from "../receivables-scope.util";

assert.equal(computeReconcileStatus(100, 100, "c1", true, 0.01), "ALIGNED");
assert.equal(computeReconcileStatus(100, 50, "c1", true, 0.01), "DELTA_1C_MORE");
assert.equal(computeReconcileStatus(50, 100, "c1", true, 0.01), "DELTA_CRM_MORE");
assert.equal(computeReconcileStatus(100, 0, null, true, 0.01), "ONLY_1C");
assert.equal(computeReconcileStatus(0, 100, "c1", false, 0.01), "ONLY_CRM");
assert.equal(isReceivablesDeltaStatus("ALIGNED"), false);
assert.equal(isReceivablesDeltaStatus("ONLY_1C"), true);

assert.ok(RECEIVABLES_DEBT_ORDER_STAGES.includes("READY_TO_SHIP"));
assert.ok(RECEIVABLES_DEBT_ORDER_STAGES.includes("SHIPPED"));
assert.equal(RECEIVABLES_DEBT_ORDER_STAGES.includes("AWAITING_STOCK" as never), false);
assert.equal(RECEIVABLES_DEBT_ORDER_STAGES.includes("CONFIRMED" as never), false);
assert.equal(RECEIVABLES_DEBT_ORDER_STAGES.includes("NEW" as never), false);
assert.equal(RECEIVABLES_DEBT_ORDER_STAGES.includes("AWAITING_PAYMENT" as never), false);

console.log("receivables-scope.util.spec: ok");
