import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateWorkflowExecutionLogDto,
  UpsertWorkflowRuleDto,
  WorkflowRuleListQuery,
  normalizeWorkflowKey,
  normalizeWorkflowRateLimit,
  optionalNullableString,
  optionalTrimmedString,
  parseWorkflowEntityType,
  parseWorkflowExecutionStatus,
  parseWorkflowTriggerType,
  validateWorkflowActions,
  validateWorkflowConditions,
} from "./dto/workflows.dto";

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService) {}

  listExecutions(query: { ruleId?: string; limit?: number }) {
    const take = Math.min(200, Math.max(1, query.limit ?? 50));
    return this.prisma.workflowExecutionLog.findMany({
      where: query.ruleId ? { ruleId: query.ruleId } : undefined,
      orderBy: { createdAt: "desc" },
      take,
      include: { rule: { select: { id: true, key: true, name: true } } },
    });
  }

  listRules(query: WorkflowRuleListQuery = {}) {
    return this.prisma.workflowRule.findMany({
      where: {
        deletedAt: query.includeDeleted ? undefined : null,
        isActive: query.includeInactive ? undefined : true,
        entityType: query.entityType,
        triggerType: query.triggerType,
      },
      orderBy: [{ createdAt: "desc" }],
    });
  }

  async getRule(id: string) {
    const rule = await this.prisma.workflowRule.findUnique({
      where: { id },
      include: { executions: { orderBy: { createdAt: "desc" }, take: 20 } },
    });
    if (!rule || rule.deletedAt) throw new NotFoundException("Workflow rule not found");
    return rule;
  }

  createRule(dto: UpsertWorkflowRuleDto) {
    const name = optionalTrimmedString(dto.name);
    if (!name) throw new BadRequestException("Workflow rule name is required");

    return this.prisma.workflowRule.create({
      data: {
        key: normalizeWorkflowKey(dto.key),
        name,
        description: optionalNullableString(dto.description),
        entityType: parseWorkflowEntityType(dto.entityType),
        triggerType: parseWorkflowTriggerType(dto.triggerType),
        triggerConfig: jsonOrNull(dto.triggerConfig),
        conditions: validateWorkflowConditions(dto.conditions),
        actions: validateWorkflowActions(dto.actions),
        rateLimitPerEntityPerHour: normalizeWorkflowRateLimit(dto.rateLimitPerEntityPerHour) ?? 10,
        isActive: dto.isActive === true,
      },
    });
  }

  async updateRule(id: string, dto: UpsertWorkflowRuleDto) {
    await this.getRule(id);
    const data: Prisma.WorkflowRuleUncheckedUpdateInput = {};
    if (dto.key !== undefined) data.key = normalizeWorkflowKey(dto.key);
    if (dto.name !== undefined) {
      const name = optionalTrimmedString(dto.name);
      if (!name) throw new BadRequestException("Workflow rule name cannot be empty");
      data.name = name;
    }
    if (dto.description !== undefined) data.description = optionalNullableString(dto.description);
    if (dto.entityType !== undefined) data.entityType = parseWorkflowEntityType(dto.entityType);
    if (dto.triggerType !== undefined) data.triggerType = parseWorkflowTriggerType(dto.triggerType);
    if (dto.triggerConfig !== undefined) data.triggerConfig = jsonOrNull(dto.triggerConfig);
    if (dto.conditions !== undefined) data.conditions = validateWorkflowConditions(dto.conditions);
    if (dto.actions !== undefined) data.actions = validateWorkflowActions(dto.actions);
    if (dto.rateLimitPerEntityPerHour !== undefined) {
      data.rateLimitPerEntityPerHour = normalizeWorkflowRateLimit(dto.rateLimitPerEntityPerHour);
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive === true;
    return this.prisma.workflowRule.update({ where: { id }, data });
  }

  async deleteRule(id: string) {
    await this.getRule(id);
    return this.prisma.workflowRule.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async createExecutionLog(ruleId: string, dto: CreateWorkflowExecutionLogDto) {
    const rule = await this.getRule(ruleId);
    return this.prisma.workflowExecutionLog.create({
      data: {
        ruleId,
        entityType: parseWorkflowEntityType(dto.entityType ?? rule.entityType),
        entityId: optionalNullableString(dto.entityId),
        triggerType: rule.triggerType,
        status: dto.status ? parseWorkflowExecutionStatus(dto.status) : undefined,
        correlationId: optionalNullableString(dto.correlationId),
        triggerPayload: jsonOrNull(dto.triggerPayload),
        actionsResult: jsonOrNull(dto.actionsResult),
        error: optionalNullableString(dto.error),
        finishedAt: dto.finishedAt ? new Date(dto.finishedAt) : undefined,
      },
    });
  }

}

function jsonOrNull(value: Prisma.InputJsonValue | null | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  return value === null ? Prisma.JsonNull : value;
}
