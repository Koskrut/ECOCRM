import { Prisma, WorkflowRule } from "@prisma/client";
import template from "lodash/template";
import { PrismaService } from "../../prisma/prisma.service";
import { WorkflowEventPublisher } from "./workflow-events";
import { WorkflowCorrelationContext, WorkflowConditionContext, WorkflowRuntimeTrigger } from "./workflow-runtime.types";

type PrismaTx = Prisma.TransactionClient;
type SupportedEntityType = "LEAD" | "CONTACT" | "COMPANY" | "ORDER";

export type WorkflowActionResult = {
  type: string;
  status: "executed" | "skipped" | "noop";
  reason?: string;
  permission?: "checked" | "bypassed";
  warnings?: string[];
  eventPublished?: boolean;
};

export class WorkflowInternalActionDispatcher {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: WorkflowEventPublisher,
  ) {}

  async executeInternalActions(params: {
    rule: WorkflowRule;
    trigger: WorkflowRuntimeTrigger;
    context: WorkflowConditionContext;
    correlation: WorkflowCorrelationContext;
  }): Promise<WorkflowActionResult[]> {
    const actions = Array.isArray(params.rule.actions) ? (params.rule.actions as Array<Record<string, unknown>>) : [];
    const sameEntityUpdates = actions.filter(
      (action) => ["update_field", "assign_user"].includes(String(action.type)) && this.targetIsTriggerEntity(action, params.trigger),
    );
    const otherActions = actions.filter((action) => !sameEntityUpdates.includes(action));
    const results: WorkflowActionResult[] = [];

    if (sameEntityUpdates.length > 0) {
      // Pattern: actions targeting the trigger entity share one Prisma transaction.
      // Domain services can pass the same tx client later so their update and workflow side-effects commit atomically.
      await this.prisma.$transaction(async (tx) => {
        for (const action of sameEntityUpdates) {
          results.push(await this.executeOne(action, params, tx));
        }
      });
    }

    for (const action of otherActions) {
      results.push(await this.prisma.$transaction((tx) => this.executeOne(action, params, tx)));
    }

    return results;
  }

  private async executeOne(
    action: Record<string, unknown>,
    params: {
      rule: WorkflowRule;
      trigger: WorkflowRuntimeTrigger;
      context: WorkflowConditionContext;
      correlation: WorkflowCorrelationContext;
    },
    tx: PrismaTx,
  ): Promise<WorkflowActionResult> {
    const type = String(action.type);
    const config = action.config && typeof action.config === "object" ? (action.config as Record<string, unknown>) : {};
    if (type === "update_field") return this.updateField(config, params, tx);
    if (type === "assign_user") return this.assignUser(config, params, tx);
    if (type === "create_task") return this.createTask(config, params, tx);
    return { type, status: "skipped", reason: "unsupported_internal_action" };
  }

  private async updateField(
    config: Record<string, unknown>,
    params: { trigger: WorkflowRuntimeTrigger; context: WorkflowConditionContext; correlation: WorkflowCorrelationContext },
    tx: PrismaTx,
  ): Promise<WorkflowActionResult> {
    const entityType = this.resolveEntityType(config, params.trigger);
    const entityId = this.resolveEntityId(config, params.trigger);
    const field = typeof config.field === "string" ? config.field : "";
    if (!entityType || !entityId || !field) return { type: "update_field", status: "skipped", reason: "validation_error" };
    if (!this.allowedFields(entityType).has(field)) return { type: "update_field", status: "skipped", reason: "validation_error" };

    const permission = await this.checkPermission(params.correlation, entityType, field);
    if (!permission.allowed) return { type: "update_field", status: "skipped", reason: "permission_denied" };

    const current = await this.findEntity(tx, entityType, entityId);
    if (!current) return { type: "update_field", status: "skipped", reason: "validation_error" };
    const nextValue = config.value;
    if ((current as Record<string, unknown>)[field] === nextValue) {
      return { type: "update_field", status: "noop", reason: "same_value", permission: permission.bypassed ? "bypassed" : "checked" };
    }

    await this.updateEntity(tx, entityType, entityId, { [field]: nextValue });
    await this.publishFieldEvent(entityType, entityId, field, (current as Record<string, unknown>)[field], nextValue, params);
    return { type: "update_field", status: "executed", permission: permission.bypassed ? "bypassed" : "checked", eventPublished: true };
  }

  private async assignUser(
    config: Record<string, unknown>,
    params: { trigger: WorkflowRuntimeTrigger; context: WorkflowConditionContext; correlation: WorkflowCorrelationContext },
    tx: PrismaTx,
  ): Promise<WorkflowActionResult> {
    const entityType = this.resolveEntityType(config, params.trigger);
    const entityId = this.resolveEntityId(config, params.trigger);
    const userId = typeof config.userId === "string" ? config.userId : typeof config.assigneeId === "string" ? config.assigneeId : "";
    if (!entityType || !entityId || !userId) return { type: "assign_user", status: "skipped", reason: "validation_error" };
    if (!this.allowedFields(entityType).has("ownerId")) return { type: "assign_user", status: "skipped", reason: "validation_error" };

    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return { type: "assign_user", status: "skipped", reason: "validation_error" };
    const permission = await this.checkPermission(params.correlation, entityType, "ownerId");
    if (!permission.allowed) return { type: "assign_user", status: "skipped", reason: "permission_denied" };

    const current = await this.findEntity(tx, entityType, entityId);
    if (!current) return { type: "assign_user", status: "skipped", reason: "validation_error" };
    if ((current as Record<string, unknown>).ownerId === userId) {
      return { type: "assign_user", status: "noop", reason: "same_user", permission: permission.bypassed ? "bypassed" : "checked" };
    }

    await this.updateEntity(tx, entityType, entityId, { ownerId: userId });
    await this.publishFieldEvent(entityType, entityId, "ownerId", (current as Record<string, unknown>).ownerId, userId, params);
    return { type: "assign_user", status: "executed", permission: permission.bypassed ? "bypassed" : "checked", eventPublished: true };
  }

  private async createTask(
    config: Record<string, unknown>,
    params: { trigger: WorkflowRuntimeTrigger; context: WorkflowConditionContext; correlation: WorkflowCorrelationContext },
    tx: PrismaTx,
  ): Promise<WorkflowActionResult> {
    const warnings: string[] = [];
    const assigneeId = await this.resolveTaskAssignee(config, params, tx);
    if (!assigneeId) return { type: "create_task", status: "skipped", reason: "validation_error" };
    const assignee = await tx.user.findUnique({ where: { id: assigneeId }, select: { id: true } });
    if (!assignee) return { type: "create_task", status: "skipped", reason: "validation_error" };

    const related = this.taskRelation(params.trigger);
    if (!related) return { type: "create_task", status: "skipped", reason: "validation_error" };
    const task = await tx.task.create({
      data: {
        assigneeId,
        createdById: params.correlation.triggeredBy?.userId ?? null,
        title: renderTemplate(String(config.title ?? "Task"), params.context, warnings),
        body: renderTemplate(String(config.description ?? ""), params.context, warnings) || null,
        dueAt: parseDueDate(config.dueDate),
        ...related,
      },
      select: { id: true },
    });

    await this.events.publish({
      trigger: {
        kind: "record.created",
        entityType: "TASK" as never,
        entityId: task.id,
        payload: { id: task.id, ...related },
        correlationId: params.correlation,
      },
      context: { record: { id: task.id, ...related }, current: { id: task.id, ...related } },
    });
    return { type: "create_task", status: "executed", warnings, eventPublished: true };
  }

  private targetIsTriggerEntity(action: Record<string, unknown>, trigger: WorkflowRuntimeTrigger): boolean {
    const config = action.config && typeof action.config === "object" ? (action.config as Record<string, unknown>) : {};
    return this.resolveEntityType(config, trigger) === trigger.entityType && this.resolveEntityId(config, trigger) === trigger.entityId;
  }

  private resolveEntityType(config: Record<string, unknown>, trigger: WorkflowRuntimeTrigger): SupportedEntityType | null {
    const value = typeof config.entityType === "string" ? config.entityType.toUpperCase() : trigger.entityType;
    return ["LEAD", "CONTACT", "COMPANY", "ORDER"].includes(String(value)) ? (value as SupportedEntityType) : null;
  }

  private resolveEntityId(config: Record<string, unknown>, trigger: WorkflowRuntimeTrigger): string | null {
    return typeof config.entityId === "string" ? config.entityId : trigger.entityId ?? null;
  }

  private async checkPermission(correlation: WorkflowCorrelationContext, entityType: string, field: string) {
    const userId = correlation.triggeredBy?.userId;
    if (!userId) {
      // TODO(V2 RBAC): replace system-trigger bypass with an explicit SYSTEM user and permission set.
      return { allowed: true, bypassed: true };
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user) return { allowed: false, bypassed: false };
    return { allowed: user.role === "ADMIN", bypassed: false, entityType, field };
  }

  private allowedFields(entityType: SupportedEntityType): Set<string> {
    const common = ["ownerId"];
    const fields: Record<SupportedEntityType, string[]> = {
      LEAD: [...common, "status", "score", "comment", "statusReason"],
      CONTACT: [...common, "status", "clientStage", "nextActionType", "nextActionNote"],
      COMPANY: common,
      ORDER: [...common, "stage", "status", "paymentStatus"],
    };
    return new Set(fields[entityType]);
  }

  private findEntity(tx: PrismaTx, entityType: SupportedEntityType, entityId: string) {
    const select = { id: true, ownerId: true } as const;
    if (entityType === "LEAD") return tx.lead.findUnique({ where: { id: entityId } });
    if (entityType === "CONTACT") return tx.contact.findUnique({ where: { id: entityId } });
    if (entityType === "COMPANY") return tx.company.findUnique({ where: { id: entityId }, select });
    return tx.order.findUnique({ where: { id: entityId } });
  }

  private updateEntity(tx: PrismaTx, entityType: SupportedEntityType, entityId: string, data: Record<string, unknown>) {
    if (entityType === "LEAD") return tx.lead.update({ where: { id: entityId }, data });
    if (entityType === "CONTACT") return tx.contact.update({ where: { id: entityId }, data });
    if (entityType === "COMPANY") return tx.company.update({ where: { id: entityId }, data });
    return tx.order.update({ where: { id: entityId }, data });
  }

  private async publishFieldEvent(
    entityType: SupportedEntityType,
    entityId: string,
    field: string,
    previousValue: unknown,
    currentValue: unknown,
    params: { context: WorkflowConditionContext; correlation: WorkflowCorrelationContext },
  ) {
    await this.events.publish({
      trigger: {
        kind: field === "status" ? "status.changed" : "field.changed",
        entityType,
        entityId,
        fieldName: field,
        previousValue,
        currentValue,
        payload: { ...(params.context.current ?? {}), id: entityId, [field]: currentValue },
        correlationId: params.correlation,
      },
      context: {
        previous: { ...(params.context.current ?? {}), id: entityId, [field]: previousValue },
        current: { ...(params.context.current ?? {}), id: entityId, [field]: currentValue },
      },
    });
  }

  private async resolveTaskAssignee(config: Record<string, unknown>, params: { trigger: WorkflowRuntimeTrigger }, tx: PrismaTx) {
    const assignedTo = config.assignedTo;
    if (typeof assignedTo === "string" && assignedTo !== "owner_of_trigger_entity") return assignedTo;
    if (assignedTo !== "owner_of_trigger_entity" || !params.trigger.entityType || !params.trigger.entityId) return null;
    const entity = await this.findEntity(tx, params.trigger.entityType as SupportedEntityType, params.trigger.entityId);
    return entity && "ownerId" in entity ? entity.ownerId : null;
  }

  private taskRelation(trigger: WorkflowRuntimeTrigger) {
    if (!trigger.entityId) return null;
    if (trigger.entityType === "LEAD") return { leadId: trigger.entityId };
    if (trigger.entityType === "CONTACT") return { contactId: trigger.entityId };
    if (trigger.entityType === "COMPANY") return { companyId: trigger.entityId };
    if (trigger.entityType === "ORDER") return { orderId: trigger.entityId };
    return null;
  }
}

export function renderTemplate(input: string, context: WorkflowConditionContext, warnings: string[] = []): string {
  const data = { field: context.current ?? context.record ?? {} };
  return input.replace(/\{\{([^{}]+)\}\}/g, (match, rawPath) => {
    const path = String(rawPath).trim();
    if (path.startsWith("#") || path.startsWith("/")) return match;
    if (readTemplatePath(data, path) === undefined) {
      warnings.push(`missing_placeholder:${path}`);
      return "";
    }
    const compiled = template(`<%= ${path} %>`, { interpolate: /<%=([\s\S]+?)%>/g, evaluate: /$^/ });
    try {
      const value = compiled(data);
      if (value === "undefined" || value === "null") {
        warnings.push(`missing_placeholder:${path}`);
        return "";
      }
      return value;
    } catch {
      warnings.push(`missing_placeholder:${path}`);
      return "";
    }
  });
}

function readTemplatePath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
  }, source);
}

function parseDueDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  const relative = text.match(/^\+(\d+)\s+days?$/i);
  if (relative) {
    const date = new Date();
    date.setDate(date.getDate() + Number(relative[1]));
    return date;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}
