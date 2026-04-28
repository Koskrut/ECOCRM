import { Injectable, Optional } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { Prisma, WorkflowExecutionStatus, WorkflowRule } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { evaluateWorkflowConditions } from "./runtime/condition-evaluator";
import { workflowRuleMatchesTrigger } from "./runtime/trigger-matcher";
import { WorkflowInternalActionDispatcher } from "./runtime/workflow-actions";
import { WORKFLOW_TRIGGER_EVENT, WorkflowEventPublisher, WorkflowTriggerEvent } from "./runtime/workflow-events";
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
  private readonly actions?: WorkflowInternalActionDispatcher;

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    eventPublisher?: WorkflowEventPublisher,
  ) {
    if (eventPublisher) this.actions = new WorkflowInternalActionDispatcher(prisma, eventPublisher);
  }

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

    const idempotentNoop = mode === "enforced" ? await this.ruleIsIdempotentNoop(rule, trigger) : false;
    if (!this.rateLimiter.allow(rule.id, trigger.entityId, rule.rateLimitPerEntityPerHour)) {
      const log = await this.writeExecutionLog(rule, trigger, correlation, mode, {
        matched: false,
        conditionsResult: false,
        error: "rate_limit_exceeded",
      });
      return { matched: false, executionLogId: log.id };
    }
    if (idempotentNoop) this.rateLimiter.release(rule.id, trigger.entityId);

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
      this.executeAndLog(rule, trigger, context, ruleCorrelation, mode, {
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

  private async ruleIsIdempotentNoop(rule: WorkflowRule, trigger: WorkflowRuntimeTrigger): Promise<boolean> {
    const actions = Array.isArray(rule.actions) ? (rule.actions as Array<Record<string, unknown>>) : [];
    if (actions.length === 0) return false;
    const supported = actions.every((action) => ["update_field", "assign_user"].includes(String(action.type)));
    if (!supported || !trigger.entityType || !trigger.entityId) return false;
    const current = await this.findNoopEntity(trigger.entityType, trigger.entityId);
    if (!current) return false;
    return actions.every((action) => {
      const config = action.config && typeof action.config === "object" ? (action.config as Record<string, unknown>) : {};
      if (action.type === "update_field") {
        const field = typeof config.field === "string" ? config.field : "";
        return field ? (current as Record<string, unknown>)[field] === config.value : false;
      }
      const userId = typeof config.userId === "string" ? config.userId : typeof config.assigneeId === "string" ? config.assigneeId : "";
      return userId ? (current as Record<string, unknown>).ownerId === userId : false;
    });
  }

  private findNoopEntity(entityType: unknown, entityId: string) {
    if (entityType === "LEAD") return this.prisma.lead.findUnique({ where: { id: entityId } });
    if (entityType === "CONTACT") return this.prisma.contact.findUnique({ where: { id: entityId } });
    if (entityType === "COMPANY") return this.prisma.company.findUnique({ where: { id: entityId }, select: { id: true, ownerId: true } });
    if (entityType === "ORDER") return this.prisma.order.findUnique({ where: { id: entityId } });
    return null;
  }

  private async executeAndLog(
    rule: WorkflowRule,
    trigger: WorkflowRuntimeTrigger,
    context: WorkflowConditionContext,
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
    const actionResults =
      mode === "enforced" && details.conditionsResult && this.actions
        ? await this.actions.executeInternalActions({ rule, trigger, context, correlation })
        : [];
    return this.writeExecutionLog(rule, trigger, correlation, mode, { ...details, actionResults });
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
      actionResults?: unknown[];
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
          actionResults: (details.actionResults ?? []) as Prisma.InputJsonValue[],
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
