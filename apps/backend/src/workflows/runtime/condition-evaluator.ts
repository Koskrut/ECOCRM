import { WorkflowConditionContext } from "./workflow-runtime.types";

export function evaluateWorkflowConditions(conditions: unknown, context: WorkflowConditionContext): boolean {
  if (conditions === undefined || conditions === null) return true;
  if (!conditions || typeof conditions !== "object" || Array.isArray(conditions)) return false;
  return evaluateNode(conditions as Record<string, unknown>, context);
}

function evaluateNode(node: Record<string, unknown>, context: WorkflowConditionContext): boolean {
  if (Array.isArray(node.all)) return node.all.every((child) => evaluateWorkflowConditions(child, context));
  if (Array.isArray(node.any)) return node.any.some((child) => evaluateWorkflowConditions(child, context));
  if ("not" in node) return !evaluateWorkflowConditions(node.not, context);

  const field = typeof node.field === "string" ? node.field : "";
  const op = typeof node.op === "string" ? node.op : "";
  const actual = resolveFieldValue(field, context);
  const expected = node.value;

  switch (op) {
    case "eq":
      return actual === expected;
    case "ne":
      return actual !== expected;
    case "gt":
      return compareValues(actual, expected) > 0;
    case "lt":
      return compareValues(actual, expected) < 0;
    case "in":
      return Array.isArray(expected) ? expected.includes(actual) : false;
    case "contains":
      return containsValue(actual, expected);
    default:
      return false;
  }
}

function resolveFieldValue(field: string, context: WorkflowConditionContext): unknown {
  if (field.startsWith("trigger.")) return readPath(context.trigger, field.slice("trigger.".length));
  if (field.startsWith("previous.")) return readPath(context.previous, field.slice("previous.".length));
  if (field.startsWith("current.")) return readPath(context.current, field.slice("current.".length));
  if (field.startsWith("record.")) return readPath(context.record, field.slice("record.".length));
  if (field.startsWith("changes.")) return readPath(context.changes, field.slice("changes.".length));
  return readPath(context.current, field) ?? readPath(context.record, field);
}

function readPath(source: unknown, path: string): unknown {
  if (!source || typeof source !== "object" || !path) return undefined;
  return path.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
  }, source);
}

function compareValues(actual: unknown, expected: unknown): number {
  const actualNumber = toComparableNumber(actual);
  const expectedNumber = toComparableNumber(expected);
  if (actualNumber === null || expectedNumber === null) return Number.NaN;
  return actualNumber - expectedNumber;
}

function toComparableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }
  if (value instanceof Date) return value.getTime();
  return null;
}

function containsValue(actual: unknown, expected: unknown): boolean {
  if (typeof actual === "string") return typeof expected === "string" && actual.includes(expected);
  if (Array.isArray(actual)) return actual.includes(expected);
  return false;
}
