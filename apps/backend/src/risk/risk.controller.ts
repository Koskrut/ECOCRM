import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { Roles } from "../auth/roles.decorator";
import { RequireModule } from "../modules/gating/require-module.decorator";
import { ModuleIds } from "../modules/module-ids";
import { RequirePermission } from "../rbac/permissions.decorator";
import { PermissionKeys } from "../rbac/rbac.constants";
import type { ApproveDecisionDto, EvaluateDeferredGateDto, UpdateCreditProfileDto } from "./dto/risk.dto";
import { RiskService } from "./risk.service";
import type { RiskDomainId, RiskSubjectType } from "@prisma/client";

@Controller("risk")
@RequireModule(ModuleIds.RiskManagement)
@Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER, UserRole.WAREHOUSE)
@RequirePermission(PermissionKeys.RiskRead)
export class RiskController {
  constructor(private readonly risk: RiskService) {}

  @Get("hub")
  getHub() {
    return this.risk.getHub();
  }

  @Get("scores")
  getScores(
    @Query("domain") domain?: RiskDomainId,
    @Query("subjectType") subjectType?: RiskSubjectType,
    @Query("subjectId") subjectId?: string,
  ) {
    return this.risk.getScores({ domain, subjectType, subjectId });
  }

  @Get("attention")
  getAttention() {
    return this.risk.getAttentionFromRisk();
  }

  @Post("recompute")
  @RequirePermission(PermissionKeys.RiskManage)
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  recompute() {
    return this.risk.recomputeAll();
  }

  @Post("evaluate/deferred")
  evaluateDeferred(@Body() body: EvaluateDeferredGateDto) {
    return this.risk.evaluateDeferredGate(body);
  }

  @Get("exposure")
  getExposure(
    @Query("contactId") contactId?: string,
    @Query("companyId") companyId?: string,
    @Query("additionalAmount") additionalAmount?: string,
  ) {
    return this.risk.getExposure({
      contactId,
      companyId,
      additionalAmount: additionalAmount ? Number(additionalAmount) : undefined,
    });
  }

  @Patch("credit-profiles/:id")
  @RequirePermission(PermissionKeys.RiskCreditManage)
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  updateCreditProfile(@Param("id") id: string, @Body() body: UpdateCreditProfileDto) {
    return this.risk.updateCreditProfile(id, body);
  }

  @Post("decisions/:id/approve")
  @RequirePermission(PermissionKeys.RiskCreditManage)
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  approveDecision(
    @Param("id") id: string,
    @Req() req: Request & { user?: AuthUser },
    @Body() _body: ApproveDecisionDto,
  ) {
    return this.risk.approveDecision(id, req.user!.id);
  }
}
