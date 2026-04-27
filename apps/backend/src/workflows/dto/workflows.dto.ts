import { BadRequestException } from "@nestjs/common";
import { CustomFieldEntityType, Prisma, WorkflowExecutionStatus, WorkflowTriggerType } from "@prisma/client";

const KEY_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;
const CONDITION_OPERATORS = new Set(["eq", "ne", "gt", "lt", "in", "contains"]);
const SAFE_ACTION_TYPES = new Set([
  "send_email",
  "send_telegram",
  "create_task",
  "update_field",
  "assign_user",
  "create_record",
  "call_webhook",
]);
const UNSAFE_ACTION_TYPES = new Set(["run_javascript", "direct_sql_query", "exec_shell", "bulk_delete"]);

export type WorkflowRuleListQuery = {
  entityType?: CustomFieldEntityType;
  triggerType?: WorkflowTriggerType;
  includeDeleted?: boolean;
  includeInactive?: boolean;
};

export type UpsertWorkflowRuleDto = {
  key?: string;
  name?: string;
  description?: string | null;
  entityType?: CustomFieldEntityType | string | null;
  triggerType?: WorkflowTriggerType | string;
  triggerConfig?: Prisma.InputJsonValue | null;
  conditions?: unknown;
  actions?: unknown;
  rateLimitPerEntityPerHour?: number;
  isActive?: boolean;
};

export type CreateWorkflowExecutionLogDto = {
  entityType?: CustomFieldEntityType | string | null;
  entityId?: string | null;
  triggerPayload?: Prisma.InputJsonValue | null;
  status?: WorkflowExecutionStatus | string;
  correlationId?: string | null;
  actionsResult?: Prisma.InputJsonValue | null;
  error?: string | null;
  finishedAt?: string | Date | null;
};

export function normalizeWorkflowKey(value: unknown, field = "key"): string {
  const key = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!key) throw new BadRequestException(`${field} is required`);
  if (key.length > 120) throw new BadRequestException(`${field} is too long`);
  if (!KEY_RE.test(key)) {
    throw new BadRequestException(`${field} must use lowercase letters, numbers, underscores, and dots`);
  }
  return key;
}

export function parseWorkflowEntityType(value: unknown): CustomFieldEntityType | null {
  if (value === undefined || value === null || value === "") return null;
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!Object.values(CustomFieldEntityType).includes(normalized as CustomFieldEntityType)) {
    throw new BadRequestException("entityType is invalid");
  }
  return normalized as CustomFieldEntityType;
}

export function parseWorkflowTriggerType(value: unknown): WorkflowTriggerType {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!Object.values(WorkflowTriggerType).includes(normalized as WorkflowTriggerType)) {
    throw new BadRequestException("triggerType is invalid");
  }
  return normalized as WorkflowTriggerType;
}

export function parseWorkflowExecutionStatus(value: unknown): WorkflowExecutionStatus {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!Object.values(WorkflowExecutionStatus).includes(normalized as WorkflowExecutionStatus)) {
    throw new BadRequestException("status is invalid");
  }
  return normalized as WorkflowExecutionStatus;
}

export function optionalTrimmedString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

export function optionalNullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = String(value).trim();
  return text || null;
}

export function normalizeWorkflowRateLimit(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 1000) {
    throw new BadRequestException("rateLimitPerEntityPerHour must be an integer between 1 and 1000");
  }
  return n;
}

export function validateWorkflowConditions(value: unknown): Prisma.InputJsonValue {
  if (value === undefined || value === null) return { all: [] };
  validateConditionNode(value, 0);
  return value as Prisma.InputJsonValue;
}

export function validateWorkflowActions(value: unknown): Prisma.InputJsonValue {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BadRequestException("actions must be a non-empty array");
  }
  if (value.length > 20) throw new BadRequestException("actions cannot contain more than 20 items");
  for (const action of value) validateAction(action);
  return value as Prisma.InputJsonValue;
}

function validateConditionNode(value: unknown, depth: number): void {
  if (depth > 5) throw new BadRequestException("conditions nesting is too deep");
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException("condition must be an object");
  }
  const node = value as Record<string, unknown>;
  const groupKeys = ["all", "any", "not"].filter((key) => key in node);
  const isLeaf = "field" in node || "op" in node || "value" in node;
  if (groupKeys.length > 0 && isLeaf) throw new BadRequestException("condition cannot mix group and leaf syntax");
  if (groupKeys.length > 1) throw new BadRequestException("condition can contain only one group operator");

  if ("all" in node || "any" in node) {
    const key = "all" in node ? "all" : "any";
    const children = node[key];
    if (!Array.isArray(children)) throw new BadRequestException(`${key} must be an array`);
    if (children.length > 50) throw new BadRequestException(`${key} cannot contain more than 50 conditions`);
    for (const child of children) validateConditionNode(child, depth + 1);
    return;
  }

  if ("not" in node) {
    validateConditionNode(node.not, depth + 1);
    return;
  }

  const field = typeof node.field === "string" ? node.field.trim() : "";
  const op = typeof node.op === "string" ? node.op.trim() : "";
  if (!field) throw new BadRequestException("condition field is required");
  if (!CONDITION_OPERATORS.has(op)) throw new BadRequestException(`condition operator is not allowed: ${op}`);
}

function validateAction(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException("action must be an object");
  }
  const action = value as Record<string, unknown>;
  const type = typeof action.type === "string" ? action.type.trim() : "";
  if (!type) throw new BadRequestException("action type is required");
  if (UNSAFE_ACTION_TYPES.has(type)) throw new BadRequestException(`action type is unsafe: ${type}`);
  if (!SAFE_ACTION_TYPES.has(type)) throw new BadRequestException(`action type is not allowed: ${type}`);
  if ("config" in action && (action.config === null || typeof action.config !== "object" || Array.isArray(action.config))) {
    throw new BadRequestException("action config must be an object");
  }
}
