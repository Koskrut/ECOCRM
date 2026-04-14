import { Controller, Get, Param, Query } from "@nestjs/common";
import type { AuditAction } from "@prisma/client";
import { AuditService } from "./audit.service";

@Controller("audit")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get(":entityType/:entityId")
  async listForEntity(
    @Param("entityType") entityType: string,
    @Param("entityId") entityId: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("action") action?: AuditAction,
    @Query("changedBy") changedBy?: string,
  ) {
    return this.audit.listForEntity(entityType, entityId, {
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 50,
      action,
      changedBy,
    });
  }
}
