import { EventEmitter2 } from "@nestjs/event-emitter";
import { Injectable } from "@nestjs/common";
import { WorkflowConditionContext, WorkflowRuntimeTrigger } from "./workflow-runtime.types";

export const WORKFLOW_TRIGGER_EVENT = "workflow.trigger";

export type WorkflowTriggerEvent = {
  trigger: WorkflowRuntimeTrigger;
  context?: WorkflowConditionContext;
};

@Injectable()
export class WorkflowEventPublisher {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  publish(event: WorkflowTriggerEvent) {
    return this.emitTrigger(event);
  }

  emitTrigger(event: WorkflowTriggerEvent) {
    return this.eventEmitter.emitAsync(WORKFLOW_TRIGGER_EVENT, event);
  }
}
