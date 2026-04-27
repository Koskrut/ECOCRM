import test from "node:test";
import assert from "node:assert/strict";
import { CustomFieldEntityType, WorkflowTriggerType } from "@prisma/client";
import {
  normalizeWorkflowKey,
  normalizeWorkflowRateLimit,
  parseWorkflowEntityType,
  parseWorkflowTriggerType,
  validateWorkflowActions,
  validateWorkflowConditions,
} from "../dto/workflows.dto";

test("workflow parsers normalize keys and trigger/entity types", () => {
  assert.equal(normalizeWorkflowKey(" Sales.Assign_Owner "), "sales.assign_owner");
  assert.equal(parseWorkflowEntityType("lead"), CustomFieldEntityType.LEAD);
  assert.equal(parseWorkflowTriggerType("record_updated"), WorkflowTriggerType.RECORD_UPDATED);
});

test("workflow conditions accept declarative condition trees", () => {
  assert.deepEqual(
    validateWorkflowConditions({
        all: [
          { field: "status", op: "eq", value: "NEW" },
          { any: [{ field: "amount", op: "gt", value: 1000 }] },
        ],
      }),
    {
      all: [
        { field: "status", op: "eq", value: "NEW" },
        { any: [{ field: "amount", op: "gt", value: 1000 }] },
      ],
    },
  );
});

test("workflow validators reject unsafe operators and action types", () => {
  assert.throws(() => validateWorkflowConditions({ field: "status", op: "matches", value: ".*" }));
  assert.throws(() => validateWorkflowActions([{ type: "exec_shell", config: { command: "rm -rf /" } }]));
});

test("workflow validators accept safe actions and rate limits", () => {
  assert.deepEqual(validateWorkflowActions([{ type: "update_field", config: { field: "ownerId", value: "user_1" } }]), [
    { type: "update_field", config: { field: "ownerId", value: "user_1" } },
  ]);
  assert.equal(normalizeWorkflowRateLimit("25"), 25);
});
