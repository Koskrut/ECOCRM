import test from "node:test";
import assert from "node:assert/strict";
import { CustomFieldEntityType, WorkflowTriggerType } from "@prisma/client";
import { renderTemplate } from "../runtime/workflow-actions";
import { WorkflowRuntimeService } from "../workflow-runtime.service";

test("workflow internal action: update_field same value is no-op and does not publish event", async () => {
  const prisma = createActionPrismaMock({
    lead: { id: "lead_1", ownerId: "user_1", status: "NEW" },
    rule: workflowRule({ actions: [{ type: "update_field", config: { field: "status", value: "NEW" } }] }),
  });
  const events = createEventPublisherMock();
  const service = new WorkflowRuntimeService(prisma as never, events as never);

  const result = await service.evaluateTrigger(trigger(), { current: { id: "lead_1", status: "NEW" } }, "enforced");
  const log = lastLog(prisma);
  const details = log.actionsResult as Record<string, unknown>;

  assert.deepEqual(result.matchedRuleIds, ["rule_1"]);
  assert.equal(prisma.lead.updateCalls.length, 0);
  assert.equal(events.published.length, 0);
  assert.deepEqual(details.actionResults, [{ type: "update_field", status: "noop", reason: "same_value", permission: "bypassed" }]);
});

test("workflow internal action: update_field publishes a chained field event", async () => {
  const prisma = createActionPrismaMock({ lead: { id: "lead_1", ownerId: "user_1", status: "NEW" } });
  const events = createEventPublisherMock();
  const service = new WorkflowRuntimeService(prisma as never, events as never);

  await service.evaluateTrigger(
    trigger({ payload: { id: "lead_1", status: "NEW" } }),
    { current: { id: "lead_1", status: "NEW" } },
    "enforced",
  );

  assert.deepEqual(prisma.lead.updateCalls[0].data, { status: "QUALIFIED" });
  assert.equal(events.published.length, 1);
  assert.equal(events.published[0].trigger.kind, "status.changed");
  assert.equal(events.published[0].trigger.correlationId.ruleHistory.includes("rule_1"), true);
});

test("workflow internal action: assign_user same user is no-op and does not publish event", async () => {
  const prisma = createActionPrismaMock({ rule: workflowRule({ actions: [{ type: "assign_user", config: { userId: "user_1" } }] }) });
  const events = createEventPublisherMock();
  const service = new WorkflowRuntimeService(prisma as never, events as never);

  await service.evaluateTrigger(trigger(), { current: { id: "lead_1", status: "NEW" } }, "enforced");

  assert.equal(prisma.lead.updateCalls.length, 0);
  assert.equal(events.published.length, 0);
  assert.equal((lastLog(prisma).actionsResult as Record<string, unknown>).actionResults[0].status, "noop");
});

test("workflow internal action: assign_user missing user is skipped with validation_error", async () => {
  const prisma = createActionPrismaMock({
    rule: workflowRule({ actions: [{ type: "assign_user", config: { userId: "missing" } }] }),
    users: [],
  });
  const service = new WorkflowRuntimeService(prisma as never, createEventPublisherMock() as never);

  await service.evaluateTrigger(trigger(), { current: { id: "lead_1", status: "NEW" } }, "enforced");

  const actionResult = (lastLog(prisma).actionsResult as Record<string, unknown>).actionResults[0] as Record<string, unknown>;
  assert.equal(actionResult.status, "skipped");
  assert.equal(actionResult.reason, "validation_error");
});

test("workflow internal action: assign_user inactive user is skipped with user_inactive", async () => {
  const prisma = createActionPrismaMock({
    rule: workflowRule({ actions: [{ type: "assign_user", config: { userId: "inactive_user" } }] }),
    users: [{ id: "inactive_user", isActive: false }],
  });
  const service = new WorkflowRuntimeService(prisma as never, createEventPublisherMock() as never);

  await service.evaluateTrigger(trigger(), { current: { id: "lead_1", status: "NEW" } }, "enforced");

  const actionResult = (lastLog(prisma).actionsResult as Record<string, unknown>).actionResults[0] as Record<string, unknown>;
  assert.equal(actionResult.status, "skipped");
  assert.equal(actionResult.reason, "validation_error");
  assert.equal(actionResult.validationError, "user_inactive");
});

test("workflow internal action: create_task validates assignee", async () => {
  const prisma = createActionPrismaMock({
    rule: workflowRule({ actions: [{ type: "create_task", config: { title: "Call {{field.status}}", assignedTo: "missing" } }] }),
    users: [],
  });
  const service = new WorkflowRuntimeService(prisma as never, createEventPublisherMock() as never);

  await service.evaluateTrigger(trigger(), { current: { id: "lead_1", status: "NEW" } }, "enforced");

  const actionResult = (lastLog(prisma).actionsResult as Record<string, unknown>).actionResults[0] as Record<string, unknown>;
  assert.equal(actionResult.status, "skipped");
  assert.equal(actionResult.reason, "validation_error");
});

test("workflow templates interpolate placeholders and warn on missing values", () => {
  const warnings: string[] = [];
  assert.equal(renderTemplate("Lead {{field.status}}", { current: { status: "NEW" } }, warnings), "Lead NEW");
  assert.equal(renderTemplate("Missing {{field.unknown}}", { current: {} }, warnings), "Missing ");
  assert.deepEqual(warnings, ["missing_placeholder:field.unknown"]);
});

test("workflow templates treat mustache sections as plain text", () => {
  assert.equal(renderTemplate("{{#if field.status}}Hi{{/if}}", { current: { status: "NEW" } }), "{{#if field.status}}Hi{{/if}}");
});

const workflowRuleDate = new Date("2026-04-27T10:00:00.000Z");

function workflowRule(overrides: Record<string, unknown> = {}) {
  return {
    id: "rule_1",
    key: "lead.qualify",
    name: "Qualify lead",
    description: null,
    entityType: CustomFieldEntityType.LEAD,
    triggerType: WorkflowTriggerType.FIELD_CHANGED,
    triggerConfig: { field: "status" },
    conditions: { field: "status", op: "eq", value: "NEW" },
    actions: [{ type: "update_field", config: { field: "status", value: "QUALIFIED" } }],
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
    payload: { id: "lead_1", status: "NEW" },
    ...overrides,
  };
}

function createEventPublisherMock() {
  return {
    published: [] as any[],
    publish(event: any) {
      this.published.push(event);
      return Promise.resolve([]);
    },
  };
}

function createActionPrismaMock(
  opts: { rule?: ReturnType<typeof workflowRule>; lead?: Record<string, unknown>; users?: Array<{ id: string; isActive?: boolean }> } = {},
) {
  let sequence = 0;
  const logs: Array<Record<string, unknown>> = [];
  const lead = { id: "lead_1", ownerId: "user_1", status: "NEW", ...(opts.lead ?? {}) };
  const users = opts.users ?? [{ id: "user_1", isActive: true }, { id: "user_2", isActive: true }];
  const prisma: any = {
    logs,
    workflowRule: { findMany: async () => [opts.rule ?? workflowRule()] },
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
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => users.find((user) => user.id === where.id) ?? null,
    },
    lead: {
      updateCalls: [] as any[],
      findUnique: async () => lead,
      update: async (args: any) => {
        prisma.lead.updateCalls.push(args);
        Object.assign(lead, args.data);
        return lead;
      },
    },
    task: {
      create: async () => ({ id: "task_1" }),
    },
    $transaction: async (fn: any) => fn(prisma),
  };
  return prisma;
}

function lastLog(prisma: ReturnType<typeof createActionPrismaMock>) {
  return prisma.logs[prisma.logs.length - 1];
}
