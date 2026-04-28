import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { WorkflowCorrelationContext, WorkflowRuntimeTrigger } from "./workflow-runtime.types";

const storage = new AsyncLocalStorage<WorkflowCorrelationContext>();

export const MAX_WORKFLOW_CHAIN_DEPTH = 3;

export function getWorkflowCorrelation(): WorkflowCorrelationContext | undefined {
  return storage.getStore();
}

export function runWithWorkflowCorrelation<T>(correlation: WorkflowCorrelationContext, fn: () => T): T {
  return storage.run(correlation, fn);
}

export function normalizeWorkflowCorrelation(trigger: WorkflowRuntimeTrigger): WorkflowCorrelationContext {
  if (isCorrelationObject(trigger.correlationId)) return trigger.correlationId;
  const current = getWorkflowCorrelation();
  if (current) return current;
  return {
    id: typeof trigger.correlationId === "string" && trigger.correlationId ? trigger.correlationId : randomUUID(),
    depth: 0,
    ruleHistory: [],
    triggeredBy: {
      type: trigger.kind,
      entityId: trigger.entityId,
      userId: trigger.payload && typeof trigger.payload.userId === "string" ? trigger.payload.userId : null,
      timestamp: new Date().toISOString(),
    },
  };
}

export function nextWorkflowCorrelation(
  current: WorkflowCorrelationContext,
  ruleId: string,
  trigger: WorkflowRuntimeTrigger,
): WorkflowCorrelationContext {
  return {
    id: current.id,
    depth: current.depth + 1,
    ruleHistory: [...current.ruleHistory, ruleId],
    triggeredBy: {
      type: trigger.kind,
      entityId: trigger.entityId,
      userId: current.triggeredBy?.userId ?? null,
      timestamp: new Date().toISOString(),
    },
  };
}

export function serializeWorkflowCorrelation(correlation: WorkflowCorrelationContext): string {
  return JSON.stringify(correlation);
}

function isCorrelationObject(value: unknown): value is WorkflowCorrelationContext {
  return Boolean(value && typeof value === "object" && "id" in value && "depth" in value && "ruleHistory" in value);
}
