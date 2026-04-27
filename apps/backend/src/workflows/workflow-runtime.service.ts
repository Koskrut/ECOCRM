import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { Prisma, WorkflowExecutionStatus, WorkflowRule } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { evaluateWorkflowConditions } from "./runtime/condition-evaluator";
import { workflowRuleMatchesTrigger } from "./runtime/trigger-matcher";
import { WORKFLOW_TRIGGER_EVENT, WorkflowTriggerEvent } from "./runtime/workflow-events";
import {
  MAX_WORKFLOW_CHAIN_DEPTH,
  nextWorkflowCorrelation,
  normalizeWorkflowCorrelation,
  runWithWorkflowCorrelation,
  serializeWorkflowCorrelation,
} from "./runtime/workflow-correlation";
import { WorkflowRateLimiter } from "./runtime/workflow-rate-limiter";
import {
  WORKFLOW_EVALUATOR_TIMEOUT_MS,
  WORKFLOW_TOTAL_RULE_TIMEOUT_MS,
  WorkflowTimeoutError,
  withWorkflowTimeout,
} from "./runtime/workflow-timeouts";
import {
  WorkflowConditionContext,
  WorkflowCorrelationContext,
  WorkflowRuntimeEvaluationResult,
  WorkflowRuntimeMode,
  WorkflowRuntimeTrigger,
} from "./runtime/workflow-runtime.types";

@Injectable()
export class WorkflowRuntimeService {
  private readonly rateLimiter = new WorkflowRateLimiter();

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(WORKFLOW_TRIGGER_EVENT, { async: true })
  handleWorkflowTrigger(event: WorkflowTriggerEvent) {
    return this.evaluateTrigger(event.trigger, event.context);
  }

  async evaluateTrigger(
    trigger: WorkflowRuntimeTrigger,
    context: WorkflowConditionContext = {},
    mode: WorkflowRuntimeMode = "shadow",
  ): Promise<WorkflowRuntimeEvaluationResult> {
    const correlation = normalizeWorkflowCorrelation(trigger);
    const evaluationContext = {
      record: context.record ?? trigger.payload ?? null,
      current: context.current ?? trigger.payload ?? null,
      ...context,
    };
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
      const ruleResult = await this.evaluateRule(rule, trigger, evaluationContext, correlation, mode);
      result.executionLogIds.push(ruleResult.executionLogId);
      if (ruleResult.matched) result.matchedRuleIds.push(rule.id);
      else result.skippedRuleIds.push(rule.id);
    }

    return result;
  }

  private async evaluateRule(
    rule: WorkflowRule,
    trigger: WorkflowRuntimeTrigger,
    context: WorkflowConditionContext,
    correlation: WorkflowCorrelationContext,
    mode: WorkflowRuntimeMode,
  ): Promise<{ matched: boolean; executionLogId: string }> {
    try {
      return await withWorkflowTimeout("total", WORKFLOW_TOTAL_RULE_TIMEOUT_MS, () =>
        this.evaluateRuleWithinTotalTimeout(rule, trigger, context, correlation, mode),
      );
    } catch (error) {
      if (error instanceof WorkflowTimeoutError) {
        const log = await this.writeExecutionLog(rule, trigger, correlation, mode, {
          matched: false,
          conditionsResult: false,
          error: "timeout_exceeded",
          where: error.where,
        });
        return { matched: false, executionLogId: log.id };
      }
      throw error;
    }
  }

  private async evaluateRuleWithinTotalTimeout(
    rule: WorkflowRule,
    trigger: WorkflowRuntimeTrigger,
    context: WorkflowConditionContext,
    correlation: WorkflowCorrelationContext,
    mode: WorkflowRuntimeMode,
  ): Promise<{ matched: boolean; executionLogId: string }> {
    if (correlation.depth >= MAX_WORKFLOW_CHAIN_DEPTH) {
      const log = await this.writeExecutionLog(rule, trigger, correlation, mode, {
        matched: false,
        conditionsResult: false,
        error: "chain_depth_exceeded",
      });
      return { matched: false, executionLogId: log.id };
    }

    if (correlation.ruleHistory.includes(rule.id)) {
      const log = await this.writeExecutionLog(rule, trigger, correlation, mode, {
        matched: false,
        conditionsResult: false,
        error: "cycle_detected",
      });
      return { matched: false, executionLogId: log.id };
    }

    if (!this.rateLimiter.allow(rule.id, trigger.entityId, rule.rateLimitPerEntityPerHour)) {
      const log = await this.writeExecutionLog(rule, trigger, correlation, mode, {
        matched: false,
        conditionsResult: false,
        error: "rate_limit_exceeded",
      });
      return { matched: false, executionLogId: log.id };
    }

    const actions = Array.isArray(rule.actions) ? rule.actions : [];
    if (actions.length > 10) {
      const log = await this.writeExecutionLog(rule, trigger, correlation, mode, {
        matched: false,
        conditionsResult: false,
        error: "too_many_actions",
      });
      return { matched: false, executionLogId: log.id };
    }

    let conditionsResult: boolean;
    try {
      conditionsResult = await withWorkflowTimeout("evaluator", WORKFLOW_EVALUATOR_TIMEOUT_MS, () =>
        this.evaluateConditions(rule, { ...context, trigger }),
      );
    } catch (error) {
      if (!(error instanceof WorkflowTimeoutError)) throw error;
      const log = await this.writeExecutionLog(rule, trigger, correlation, mode, {
        matched: false,
        conditionsResult: false,
        error: "timeout_exceeded",
        where: error.where,
      });
      return { matched: false, executionLogId: log.id };
    }

    const ruleCorrelation = nextWorkflowCorrelation(correlation, rule.id, trigger);
    const log = await runWithWorkflowCorrelation(ruleCorrelation, () =>
      this.writeExecutionLog(rule, trigger, ruleCorrelation, mode, {
        matched: conditionsResult,
        conditionsResult,
        actionsPlanned: conditionsResult ? actions : [],
      }),
    );

    return { matched: conditionsResult, executionLogId: log.id };
  }

  protected evaluateConditions(rule: WorkflowRule, context: WorkflowConditionContext): boolean | Promise<boolean> {
    return evaluateWorkflowConditions(rule.conditions, context);
  }

  private async writeExecutionLog(
    rule: WorkflowRule,
    trigger: WorkflowRuntimeTrigger,
    correlation: WorkflowCorrelationContext,
    mode: WorkflowRuntimeMode,
    details: {
      matched: boolean;
      conditionsResult: boolean;
      actionsPlanned?: unknown[];
      error?: string;
      where?: string;
    },
  ) {
    const matchedAt = new Date();
    const started = Date.now();
    const log = await this.prisma.workflowExecutionLog.create({
      data: {
        ruleId: rule.id,
        entityType: trigger.entityType ?? rule.entityType,
        entityId: trigger.entityId,
        triggerType: rule.triggerType,
        status: details.error === "timeout_exceeded" ? WorkflowExecutionStatus.FAILED : WorkflowExecutionStatus.SKIPPED,
        correlationId: serializeWorkflowCorrelation(correlation),
        triggerPayload: jsonOrNull(trigger.payload as Prisma.InputJsonValue | undefined),
        actionsResult: {
          mode,
          ruleVersion: rule.updatedAt.toISOString(),
          matchedAt: matchedAt.toISOString(),
          durationMs: Date.now() - started,
          conditionsResult: details.conditionsResult,
          actionsPlanned: (details.actionsPlanned ?? []) as Prisma.InputJsonValue[],
          ...(details.error ? { error: details.error } : {}),
          ...(details.where ? { where: details.where } : {}),
        },
        error: details.error,
        finishedAt: new Date(),
      },
    });

    return this.prisma.workflowExecutionLog.update({
      where: { id: log.id },
      data: {
        actionsResult: {
          ...((log.actionsResult ?? {}) as Record<string, unknown>),
          executionId: log.id,
          ruleId: rule.id,
          triggerType: rule.triggerType,
          entityType: trigger.entityType ?? rule.entityType,
          entityId: trigger.entityId,
          durationMs: Date.now() - started,
        } as Prisma.InputJsonValue,
      },
    });
  }
}

function jsonOrNull(value: Prisma.InputJsonValue | null | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  return value === null ? Prisma.JsonNull : value;
}
