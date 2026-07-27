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
import {
  ApproveDecisionDto,
  EvaluateDeferredGateDto,
  GetExposureQueryDto,
  GetScoresQueryDto,
  UpdateCreditPolicyDto,
  UpdateCreditProfileDto,
} from "./dto/risk.dto";
import { RiskService } from "./risk.service";

@Controller("risk")
@RequireModule(ModuleIds.RiskManagement)
@Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
@RequirePermission(PermissionKeys.RiskRead)
export class RiskController {
  constructor(private readonly risk: RiskService) {}

  @Get("hub")
  getHub() {
    return this.risk.getHub();
  }

  @Get("scores")
  getScores(@Query() query: GetScoresQueryDto) {
    return this.risk.getScores(query);
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
  evaluateDeferred(@Body() body: EvaluateDeferredGateDto, @Req() req: Request & { user?: AuthUser }) {
    return this.risk.evaluateDeferredGate({
      ...body,
      requestedById: req.user?.id,
      persistDecision: body.persistDecision ?? false,
    });
  }

  @Get("exposure")
  getExposure(@Query() query: GetExposureQueryDto) {
    return this.risk.getExposure({
      contactId: query.contactId,
      companyId: query.companyId,
      additionalAmount: query.additionalAmount,
      excludeOrderId: query.excludeOrderId,
      persist: query.persist ?? false,
    });
  }

  @Get("policies/CLIENT_CREDIT")
  @RequirePermission(PermissionKeys.RiskManage)
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  getCreditPolicy() {
    return this.risk.getCreditPolicy();
  }

  @Patch("policies/CLIENT_CREDIT")
  @RequirePermission(PermissionKeys.RiskManage)
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  updateCreditPolicy(@Body() body: UpdateCreditPolicyDto) {
    return this.risk.updateCreditPolicy(body);
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
