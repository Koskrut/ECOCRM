import { Injectable } from "@nestjs/common";
import { Prisma, WorkflowExecutionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { evaluateWorkflowConditions } from "./runtime/condition-evaluator";
import { workflowRuleMatchesTrigger } from "./runtime/trigger-matcher";
import {
  WorkflowConditionContext,
  WorkflowRuntimeEvaluationResult,
  WorkflowRuntimeTrigger,
} from "./runtime/workflow-runtime.types";

@Injectable()
export class WorkflowRuntimeService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluateTrigger(
    trigger: WorkflowRuntimeTrigger,
    context: WorkflowConditionContext = {},
  ): Promise<WorkflowRuntimeEvaluationResult> {
    const rules = await this.prisma.workflowRule.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        OR: [{ entityType: trigger.entityType ?? null }, { entityType: null }],
      },
      orderBy: [{ createdAt: "asc" }],
    });

    const result: WorkflowRuntimeEvaluationResult = {
      matchedRuleIds: [],
      skippedRuleIds: [],
      executionLogIds: [],
    };

    for (const rule of rules) {
      if (!workflowRuleMatchesTrigger(rule, trigger)) continue;
      const conditionMatched = evaluateWorkflowConditions(rule.conditions, { ...context, trigger });
      if (!conditionMatched) {
        result.skippedRuleIds.push(rule.id);
        continue;
      }

      const log = await this.prisma.workflowExecutionLog.create({
        data: {
          ruleId: rule.id,
          entityType: trigger.entityType ?? rule.entityType,
          entityId: trigger.entityId,
          triggerType: rule.triggerType,
          status: WorkflowExecutionStatus.SKIPPED,
          correlationId: trigger.correlationId,
          triggerPayload: jsonOrNull(trigger.payload as Prisma.InputJsonValue | undefined),
          actionsResult: {
            mode: "dry_run",
            matched: true,
            wouldExecute: true,
            actionCount: Array.isArray(rule.actions) ? rule.actions.length : 0,
          },
          finishedAt: new Date(),
        },
      });

      result.matchedRuleIds.push(rule.id);
      result.executionLogIds.push(log.id);
    }

    return result;
  }
}

function jsonOrNull(value: Prisma.InputJsonValue | null | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  return value === null ? Prisma.JsonNull : value;
}
