import { Injectable } from "@nestjs/common";
import type { CustomFieldEntityType } from "@prisma/client";
import { WorkflowEventPublisher } from "./runtime/workflow-events";
import type { WorkflowConditionContext } from "./runtime/workflow-runtime.types";

@Injectable()
export class WorkflowDomainEmitterService {
  constructor(private readonly publisher: WorkflowEventPublisher) {}

  emitRecordCreated(
    entityType: CustomFieldEntityType,
    entityId: string,
    record: Record<string, unknown>,
    context?: WorkflowConditionContext,
  ) {
    void this.publisher.emitTrigger({
      trigger: {
        kind: "record.created",
        entityType,
        entityId,
        payload: { record },
      },
      context: context ?? { record, current: record },
    });
  }

  emitRecordUpdated(
    entityType: CustomFieldEntityType,
    entityId: string,
    record: Record<string, unknown>,
    changes?: Record<string, { previous?: unknown; current?: unknown }> | null,
    context?: WorkflowConditionContext,
  ) {
    void this.publisher.emitTrigger({
      trigger: {
        kind: "record.updated",
        entityType,
        entityId,
        payload: { record, changes: changes ?? undefined },
      },
      context: context ?? { record, current: record, changes: changes ?? undefined },
    });
  }
}
