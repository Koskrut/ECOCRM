import { Controller, Get, Param, Query, Req } from "@nestjs/common";
import type { AuditAction } from "@prisma/client";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { AuditAccessService } from "./audit-access.service";
import { AuditService } from "./audit.service";

@Controller("audit")
export class AuditController {
  constructor(
    private readonly audit: AuditService,
    private readonly auditAccess: AuditAccessService,
  ) {}

  @Get(":entityType/:entityId")
  async listForEntity(
    @Param("entityType") entityType: string,
    @Param("entityId") entityId: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("action") action?: AuditAction,
    @Query("changedBy") changedBy?: string,
    @Req() req?: Request & { user?: AuthUser },
  ) {
    await this.auditAccess.assertAccess(entityType, entityId, req?.user);
    return this.audit.listForEntity(entityType, entityId, {
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 50,
      action,
      changedBy,
    });
  }
}
