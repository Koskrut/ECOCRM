import test from "node:test";
import assert from "node:assert/strict";
import { CustomFieldEntityType, WorkflowTriggerType } from "@prisma/client";
import { workflowRuleMatchesTrigger } from "../runtime/trigger-matcher";

test("workflow trigger matcher: one event can match multiple rules", () => {
  const trigger = { kind: "record.updated" as const, entityType: CustomFieldEntityType.LEAD, entityId: "lead_1" };
  const rules = [
    rule("rule_1", WorkflowTriggerType.RECORD_UPDATED),
    rule("rule_2", WorkflowTriggerType.RECORD_UPDATED),
    rule("rule_3", WorkflowTriggerType.RECORD_CREATED),
  ];

  assert.deepEqual(
    rules.filter((candidate) => workflowRuleMatchesTrigger(candidate, trigger)).map((candidate) => candidate.id),
    ["rule_1", "rule_2"],
  );
});

test("workflow trigger matcher: record.updated does not match record.created", () => {
  assert.equal(
    workflowRuleMatchesTrigger(rule("rule_1", WorkflowTriggerType.RECORD_UPDATED), {
      kind: "record.created",
      entityType: CustomFieldEntityType.LEAD,
    }),
    false,
  );
  assert.equal(
    workflowRuleMatchesTrigger(rule("rule_2", WorkflowTriggerType.RECORD_CREATED), {
      kind: "record.updated",
      entityType: CustomFieldEntityType.LEAD,
    }),
    false,
  );
});

test("workflow trigger matcher: field.changed matches only configured field", () => {
  assert.equal(
    workflowRuleMatchesTrigger(rule("rule_1", WorkflowTriggerType.FIELD_CHANGED, { field: "ownerId" }), {
      kind: "field.changed",
      entityType: CustomFieldEntityType.LEAD,
      fieldName: "ownerId",
    }),
    true,
  );
  assert.equal(
    workflowRuleMatchesTrigger(rule("rule_2", WorkflowTriggerType.FIELD_CHANGED, { field: "ownerId" }), {
      kind: "field.changed",
      entityType: CustomFieldEntityType.LEAD,
      fieldName: "status",
    }),
    false,
  );
});

test("workflow trigger matcher: field.changed:status and status.changed are separate triggers", () => {
  assert.equal(
    workflowRuleMatchesTrigger(rule("rule_1", WorkflowTriggerType.FIELD_CHANGED, { field: "status" }), {
      kind: "status.changed",
      entityType: CustomFieldEntityType.LEAD,
      fieldName: "status",
    }),
    false,
  );
  assert.equal(
    workflowRuleMatchesTrigger(rule("rule_2", WorkflowTriggerType.STATUS_CHANGED), {
      kind: "field.changed",
      entityType: CustomFieldEntityType.LEAD,
      fieldName: "status",
    }),
    false,
  );
});

function rule(id: string, triggerType: WorkflowTriggerType, triggerConfig: unknown = null) {
  return {
    id,
    triggerType,
    triggerConfig,
    entityType: CustomFieldEntityType.LEAD,
  };
}
