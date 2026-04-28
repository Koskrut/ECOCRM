import { Prisma, WorkflowRule, WorkflowTriggerType } from "@prisma/client";
import { WorkflowRuntimeTrigger } from "./workflow-runtime.types";

export function workflowRuleMatchesTrigger(
  rule: Pick<WorkflowRule, "triggerType" | "triggerConfig" | "entityType">,
  trigger: WorkflowRuntimeTrigger,
): boolean {
  if (rule.entityType && trigger.entityType && rule.entityType !== trigger.entityType) return false;
  if (rule.entityType && !trigger.entityType) return false;

  switch (trigger.kind) {
    case "record.created":
      return rule.triggerType === WorkflowTriggerType.RECORD_CREATED;
    case "record.updated":
      return rule.triggerType === WorkflowTriggerType.RECORD_UPDATED;
    case "field.changed":
      return rule.triggerType === WorkflowTriggerType.FIELD_CHANGED && fieldMatches(rule.triggerConfig, trigger.fieldName);
    case "status.changed":
      return rule.triggerType === WorkflowTriggerType.STATUS_CHANGED;
    case "schedule":
      return rule.triggerType === WorkflowTriggerType.SCHEDULE;
    case "webhook.received":
      return rule.triggerType === WorkflowTriggerType.WEBHOOK_RECEIVED;
    default:
      return false;
  }
}

function fieldMatches(config: Prisma.JsonValue | null, fieldName: string | null | undefined): boolean {
  if (!fieldName) return false;
  if (!config || typeof config !== "object" || Array.isArray(config)) return true;
  const configured = (config as Record<string, unknown>).field ?? (config as Record<string, unknown>).fieldName;
  return typeof configured === "string" ? configured === fieldName : true;
}
