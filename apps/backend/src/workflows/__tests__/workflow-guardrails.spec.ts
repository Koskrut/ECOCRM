import test from "node:test";
import assert from "node:assert/strict";
import { CustomFieldEntityType, WorkflowTriggerType } from "@prisma/client";
import { validateWorkflowActions } from "../dto/workflows.dto";
import { WorkflowRuntimeService } from "../workflow-runtime.service";

test("workflow guardrail: rate limits 11th execution per rule/entity/hour", async () => {
  const prisma = createWorkflowPrismaMock([workflowRule()]);
  const service = new WorkflowRuntimeService(prisma as never);

  for (let i = 0; i < 10; i += 1) {
    const result = await service.evaluateTrigger(trigger());
    assert.deepEqual(result.matchedRuleIds, ["rule_1"]);
  }

  const result = await service.evaluateTrigger(trigger());
  assert.deepEqual(result.matchedRuleIds, []);
  assert.deepEqual(result.skippedRuleIds, ["rule_1"]);
  assert.equal(lastLog(prisma).error, "rate_limit_exceeded");
});

test("workflow guardrail: evaluator timeout logs timeout_exceeded with evaluator location", async () => {
  class SlowRuntimeService extends WorkflowRuntimeService {
    protected override async evaluateConditions(): Promise<boolean> {
      await new Promise((resolve) => setTimeout(resolve, 1100));
      return true;
    }
  }

  const prisma = createWorkflowPrismaMock([workflowRule()]);
  const service = new SlowRuntimeService(prisma as never);
  const result = await service.evaluateTrigger(trigger({ entityId: "lead_timeout" }));

  assert.deepEqual(result.matchedRuleIds, []);
  assert.equal(lastLog(prisma).error, "timeout_exceeded");
  assert.equal((lastLog(prisma).actionsResult as Record<string, unknown>).where, "evaluator");
});

test("workflow guardrail: max 10 actions is validated on rule save", () => {
  assert.throws(
    () => validateWorkflowActions(Array.from({ length: 11 }, (_, index) => ({ type: "update_field", config: { index } }))),
    /actions cannot contain more than 10 items/,
  );
});

test("workflow guardrail: chain depth 3 blocks fourth rule execution", async () => {
  const prisma = createWorkflowPrismaMock([workflowRule()]);
  const service = new WorkflowRuntimeService(prisma as never);
  const result = await service.evaluateTrigger(
    trigger({
      entityId: "lead_chain",
      correlationId: {
        id: "corr_chain",
        depth: 3,
        ruleHistory: ["rule_a", "rule_b", "rule_c"],
        triggeredBy: { type: "field.changed", entityId: "lead_chain", timestamp: new Date().toISOString() },
      },
    }),
  );

  assert.deepEqual(result.matchedRuleIds, []);
  assert.equal(lastLog(prisma).error, "chain_depth_exceeded");
});

test("workflow guardrail: cycle detection skips repeated rule in correlation history", async () => {
  const prisma = createWorkflowPrismaMock([workflowRule()]);
  const service = new WorkflowRuntimeService(prisma as never);
  const result = await service.evaluateTrigger(
    trigger({
      entityId: "lead_cycle",
      correlationId: {
        id: "corr_cycle",
        depth: 2,
        ruleHistory: ["rule_b", "rule_1"],
        triggeredBy: { type: "field.changed", entityId: "lead_cycle", timestamp: new Date().toISOString() },
      },
    }),
  );

  assert.deepEqual(result.matchedRuleIds, []);
  assert.equal(lastLog(prisma).error, "cycle_detected");
});

test("workflow shadow log contains execution metadata and planned actions", async () => {
  const prisma = createWorkflowPrismaMock([workflowRule()]);
  const service = new WorkflowRuntimeService(prisma as never);
  const result = await service.evaluateTrigger(trigger({ entityId: "lead_shadow" }));
  const log = lastLog(prisma);
  const details = log.actionsResult as Record<string, unknown>;

  assert.equal(result.executionLogIds.length, 1);
  assert.equal(details.executionId, log.id);
  assert.equal(details.ruleId, "rule_1");
  assert.equal(details.ruleVersion, workflowRuleDate.toISOString());
  assert.equal(details.triggerType, WorkflowTriggerType.FIELD_CHANGED);
  assert.equal(details.entityType, CustomFieldEntityType.LEAD);
  assert.equal(details.entityId, "lead_shadow");
  assert.equal(details.conditionsResult, true);
  assert.equal(details.mode, "shadow");
  assert.deepEqual(details.actionsPlanned, [{ type: "update_field", config: { field: "ownerId", value: "user_1" } }]);
  assert.equal(typeof details.durationMs, "number");
  assert.equal(typeof details.matchedAt, "string");
});

const workflowRuleDate = new Date("2026-04-27T10:00:00.000Z");

function workflowRule(overrides: Record<string, unknown> = {}) {
  return {
    id: "rule_1",
    key: "lead.assign_owner",
    name: "Assign owner",
    description: null,
    entityType: CustomFieldEntityType.LEAD,
    triggerType: WorkflowTriggerType.FIELD_CHANGED,
    triggerConfig: { field: "status" },
    conditions: { field: "status", op: "eq", value: "NEW" },
    actions: [{ type: "update_field", config: { field: "ownerId", value: "user_1" } }],
    rateLimitPerEntityPerHour: 10,
    isActive: true,
    createdAt: workflowRuleDate,
    updatedAt: workflowRuleDate,
    deletedAt: null,
    ...overrides,
  };
}

function trigger(overrides: Record<string, unknown> = {}) {
  return {
    kind: "field.changed" as const,
    entityType: CustomFieldEntityType.LEAD,
    entityId: "lead_1",
    fieldName: "status",
    payload: { status: "NEW" },
    ...overrides,
  };
}

function createWorkflowPrismaMock(rules: ReturnType<typeof workflowRule>[]) {
  let sequence = 0;
  const logs: Array<Record<string, unknown>> = [];
  return {
    logs,
    workflowRule: {
      findMany: async () => rules,
    },
    workflowExecutionLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        sequence += 1;
        const log = { id: `exec_${sequence}`, ...data };
        logs.push(log);
        return log;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const index = logs.findIndex((log) => log.id === where.id);
        logs[index] = { ...logs[index], ...data };
        return logs[index];
      },
    },
  };
}

function lastLog(prisma: ReturnType<typeof createWorkflowPrismaMock>) {
  return prisma.logs[prisma.logs.length - 1];
}
