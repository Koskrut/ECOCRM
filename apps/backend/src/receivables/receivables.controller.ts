import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { UserRole } from "@prisma/client";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { Roles } from "../auth/roles.decorator";
import { RequireModule } from "../modules/gating/require-module.decorator";
import { ModuleIds } from "../modules/module-ids";
import { ReceivablesService } from "./receivables.service";

@Controller("receivables")
@RequireModule(ModuleIds.Finance)
export class ReceivablesController {
  constructor(private readonly service: ReceivablesService) {}

  private requireUser(req: Request & { user?: AuthUser }): AuthUser {
    if (!req.user) throw new BadRequestException("User not found in request");
    return req.user;
  }

  @Get("snapshots")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  listSnapshots(@Query("limit") limit?: string) {
    return this.service.listSnapshots(limit ? Number(limit) : 20);
  }

  @Post("snapshots/upload")
  @UseInterceptors(FileInterceptor("file"))
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  uploadSnapshot(
    @UploadedFile() file: { buffer?: Buffer } | undefined,
    @Body() body: { snapshotDate?: string; note?: string },
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!file?.buffer) throw new BadRequestException("File is required");
    return this.service.uploadSnapshot({
      actor: this.requireUser(req),
      fileBuffer: file.buffer,
      snapshotDate: body.snapshotDate,
      note: body.note,
    });
  }

  @Get("reconciliation/summary")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  reconciliationSummary(
    @Query("snapshotId") snapshotId: string,
    @Query("ownerId") ownerId: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!snapshotId?.trim()) throw new BadRequestException("snapshotId is required");
    return this.service.getReconciliationSummary(snapshotId.trim(), this.requireUser(req), ownerId);
  }

  @Get("reconciliation")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  listReconciliation(
    @Query("snapshotId") snapshotId: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("status") status?: string,
    @Query("deltasOnly") deltasOnly?: string,
    @Query("q") q?: string,
    @Query("ownerId") ownerId?: string,
    @Req() req?: Request & { user?: AuthUser },
  ) {
    if (!snapshotId?.trim()) throw new BadRequestException("snapshotId is required");
    return this.service.listReconciliation(snapshotId.trim(), this.requireUser(req!), {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status,
      deltasOnly: deltasOnly === "true" || deltasOnly === "1",
      q,
      ownerId,
    });
  }

  @Post("reconciliation/refresh")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  refreshReconciliation(
    @Body() body: { snapshotId?: string },
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!body.snapshotId?.trim()) throw new BadRequestException("snapshotId is required");
    return this.service.refreshReconciliation(body.snapshotId.trim(), this.requireUser(req));
  }

  @Get("work/summary")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  workSummary(
    @Query("ownerId") ownerId: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.service.getWorkSummary(this.requireUser(req), ownerId);
  }

  @Get("work/clients")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  workClients(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("q") q?: string,
    @Query("ownerId") ownerId?: string,
    @Query("overdue") overdue?: string,
    @Req() req?: Request & { user?: AuthUser },
  ) {
    return this.service.listWorkClients(this.requireUser(req!), {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      q,
      ownerId,
      overdue: overdue === "true" || overdue === "1",
    });
  }

  @Get("work/orders")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  workOrders(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("q") q?: string,
    @Query("ownerId") ownerId?: string,
    @Query("overdue") overdue?: string,
    @Query("contactId") contactId?: string,
    @Req() req?: Request & { user?: AuthUser },
  ) {
    return this.service.listWorkOrders(this.requireUser(req!), {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      q,
      ownerId,
      overdue: overdue === "true" || overdue === "1",
      contactId,
    });
  }
}
