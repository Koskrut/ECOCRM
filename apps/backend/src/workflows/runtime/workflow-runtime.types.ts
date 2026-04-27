import { CustomFieldEntityType } from "@prisma/client";

export type WorkflowRuntimeTriggerKind =
  | "record.created"
  | "record.updated"
  | "field.changed"
  | "status.changed"
  | "schedule"
  | "webhook.received";

export type WorkflowRuntimeTrigger = {
  kind: WorkflowRuntimeTriggerKind;
  entityType?: CustomFieldEntityType | null;
  entityId?: string | null;
  fieldName?: string | null;
  previousValue?: unknown;
  currentValue?: unknown;
  payload?: Record<string, unknown>;
  correlationId?: WorkflowCorrelationContext | string | null;
};

export type WorkflowConditionContext = {
  record?: Record<string, unknown> | null;
  previous?: Record<string, unknown> | null;
  current?: Record<string, unknown> | null;
  changes?: Record<string, { previous?: unknown; current?: unknown }> | null;
  trigger?: WorkflowRuntimeTrigger;
};

export type WorkflowCorrelationContext = {
  id: string;
  depth: number;
  ruleHistory: string[];
  triggeredBy?: {
    type: string;
    entityId?: string | null;
    userId?: string | null;
    timestamp: string;
  };
};

export type WorkflowRuntimeMode = "shadow" | "enforced";

export type WorkflowRuntimeEvaluationResult = {
  matchedRuleIds: string[];
  skippedRuleIds: string[];
  executionLogIds: string[];
};
