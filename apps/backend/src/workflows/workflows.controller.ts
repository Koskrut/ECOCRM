import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Roles } from "../auth/roles.decorator";
import { RequirePermission } from "../rbac/permissions.decorator";
import { PermissionKeys } from "../rbac/rbac.constants";
import { UserRole } from "@prisma/client";
import {
  CreateWorkflowExecutionLogDto,
  UpsertWorkflowRuleDto,
  parseWorkflowEntityType,
  parseWorkflowTriggerType,
} from "./dto/workflows.dto";
import { WorkflowsService } from "./workflows.service";

@Controller("workflows")
@Roles(UserRole.ADMIN)
@RequirePermission(PermissionKeys.WorkflowsManage)
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get("executions")
  listExecutions(@Query("ruleId") ruleId?: string, @Query("limit") limit?: string) {
    const n = limit ? Number(limit) : undefined;
    return this.workflows.listExecutions({
      ruleId: ruleId?.trim() || undefined,
      limit: n !== undefined && !Number.isNaN(n) ? n : undefined,
    });
  }

  @Get("rules")
  listRules(
    @Query("entityType") entityType?: string,
    @Query("triggerType") triggerType?: string,
    @Query("includeDeleted") includeDeleted?: string,
    @Query("includeInactive") includeInactive?: string,
  ) {
    return this.workflows.listRules({
      entityType: entityType ? parseWorkflowEntityType(entityType) ?? undefined : undefined,
      triggerType: triggerType ? parseWorkflowTriggerType(triggerType) : undefined,
      includeDeleted: includeDeleted === "true",
      includeInactive: includeInactive === "true",
    });
  }

  @Post("rules")
  createRule(@Body() body: UpsertWorkflowRuleDto) {
    return this.workflows.createRule(body);
  }

  @Get("rules/:id")
  getRule(@Param("id") id: string) {
    return this.workflows.getRule(id);
  }

  @Patch("rules/:id")
  updateRule(@Param("id") id: string, @Body() body: UpsertWorkflowRuleDto) {
    return this.workflows.updateRule(id, body);
  }

  @Delete("rules/:id")
  deleteRule(@Param("id") id: string) {
    return this.workflows.deleteRule(id);
  }

  @Post("rules/:id/executions")
  createExecutionLog(@Param("id") id: string, @Body() body: CreateWorkflowExecutionLogDto) {
    return this.workflows.createExecutionLog(id, body);
  }
}
