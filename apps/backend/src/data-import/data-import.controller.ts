import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { Roles } from "../auth/roles.decorator";
import { RequirePermission } from "../rbac/permissions.decorator";
import { PermissionKeys } from "../rbac/rbac.constants";
import { DataImportService } from "./data-import.service";

@Controller("data-import")
@Roles(UserRole.ADMIN)
@RequirePermission(PermissionKeys.SystemManage)
export class DataImportController {
  constructor(private readonly dataImport: DataImportService) {}

  @Get("jobs")
  listJobs(@Req() req: Request & { user?: AuthUser }, @Query("limit") limit?: string) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    const n = limit ? Number(limit) : 30;
    return this.dataImport.listJobs(userId, Number.isNaN(n) ? 30 : n);
  }

  @Get("jobs/:id")
  getJob(@Req() req: Request & { user?: AuthUser }, @Param("id") id: string) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    return this.dataImport.getJob(id, userId);
  }

  @Post("jobs/contacts")
  createStaging(@Req() req: Request & { user?: AuthUser }, @Body() body: { csvText: string; fileName?: string }) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    if (!body?.csvText || typeof body.csvText !== "string") {
      throw new BadRequestException("csvText is required");
    }
    return this.dataImport.createContactsStagingJob(userId, body.fileName, body.csvText);
  }

  @Post("jobs/:id/validate")
  validateJob(@Req() req: Request & { user?: AuthUser }, @Param("id") id: string) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    return this.dataImport.validateJob(id, userId);
  }

  @Post("jobs/:id/commit")
  commitJob(@Req() req: Request & { user?: AuthUser }, @Param("id") id: string) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    return this.dataImport.commitContactsJob(id, userId);
  }

  @Post("contacts/csv")
  async importContactsCsv(
    @Req() req: Request & { user?: AuthUser },
    @Body() body: { csvText: string; fileName?: string },
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    if (!body?.csvText || typeof body.csvText !== "string") {
      throw new BadRequestException("csvText is required");
    }
    return this.dataImport.createContactsImportJob(userId, body.fileName, body.csvText);
  }
}
