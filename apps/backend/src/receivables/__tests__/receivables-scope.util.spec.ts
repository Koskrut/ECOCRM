import assert from "node:assert/strict";
import { RECEIVABLES_DEBT_ORDER_STAGES } from "../receivables.constants";
import {
  buildBitrixLegacyDebtOrderWhere,
  buildOperationalDebtOrderWhere,
  buildReceivablesPositiveDebtOrderWhere,
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
assert.equal(RECEIVABLES_DEBT_ORDER_STAGES.includes("CANCELED" as never), false);

const operationalWhere = buildOperationalDebtOrderWhere({ clientId: "c1" });
assert.ok(Array.isArray(operationalWhere.AND));
assert.equal((operationalWhere.AND as unknown[]).length, 3);

const scope = { orderScope: { actor: { id: "a", role: "ADMIN" } } } as never;
const bitrixWhere = JSON.stringify(buildBitrixLegacyDebtOrderWhere(scope));
assert.equal(bitrixWhere.includes('"not":"bitrix"'), false);
assert.ok(bitrixWhere.includes('"bitrix"'));

const debtOnly = JSON.stringify(buildReceivablesPositiveDebtOrderWhere(scope));
assert.ok(debtOnly.includes('"debtAmount"'));
assert.equal(debtOnly.includes("creditAmount"), false);

console.log("receivables-scope.util.spec: ok");
