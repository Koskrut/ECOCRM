import test from "node:test";
import assert from "node:assert/strict";
import { evaluateWorkflowConditions } from "../runtime/condition-evaluator";

test("workflow condition evaluator supports eq, ne, gt, lt, in, contains", () => {
  const context = {
    current: {
      status: "NEW",
      total: 1500,
      tags: ["vip", "b2b"],
      title: "urgent order",
    },
  };

  assert.equal(evaluateWorkflowConditions({ field: "status", op: "eq", value: "NEW" }, context), true);
  assert.equal(evaluateWorkflowConditions({ field: "status", op: "ne", value: "DONE" }, context), true);
  assert.equal(evaluateWorkflowConditions({ field: "total", op: "gt", value: 1000 }, context), true);
  assert.equal(evaluateWorkflowConditions({ field: "total", op: "lt", value: 2000 }, context), true);
  assert.equal(evaluateWorkflowConditions({ field: "status", op: "in", value: ["NEW", "IN_PROGRESS"] }, context), true);
  assert.equal(evaluateWorkflowConditions({ field: "tags", op: "contains", value: "vip" }, context), true);
  assert.equal(evaluateWorkflowConditions({ field: "title", op: "contains", value: "order" }, context), true);
});

test("workflow condition evaluator supports all, any, not composition", () => {
  assert.equal(
    evaluateWorkflowConditions(
      {
        all: [
          { field: "status", op: "eq", value: "NEW" },
          {
            any: [
              { field: "total", op: "gt", value: 5000 },
              { not: { field: "ownerId", op: "eq", value: null } },
            ],
          },
        ],
      },
      { current: { status: "NEW", total: 1000, ownerId: "user_1" } },
    ),
    true,
  );
});

test("workflow condition evaluator resolves explicit context paths", () => {
  assert.equal(
    evaluateWorkflowConditions(
      {
        all: [
          { field: "previous.status", op: "eq", value: "NEW" },
          { field: "current.status", op: "eq", value: "WON" },
          { field: "changes.status.current", op: "eq", value: "WON" },
          { field: "trigger.fieldName", op: "eq", value: "status" },
        ],
      },
      {
        previous: { status: "NEW" },
        current: { status: "WON" },
        changes: { status: { previous: "NEW", current: "WON" } },
        trigger: { kind: "field.changed", fieldName: "status" },
      },
    ),
    true,
  );
});

test("workflow condition evaluator returns false for unsupported operators", () => {
  assert.equal(evaluateWorkflowConditions({ field: "status", op: "matches", value: ".*" }, { current: { status: "NEW" } }), false);
});
