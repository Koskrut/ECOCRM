import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { Request } from "express";
import type { AuthUser } from "../../auth/auth.types";
import { Roles } from "../../auth/roles.decorator";
import { RequireModule } from "../../modules/gating/require-module.decorator";
import { ModuleIds } from "../../modules/module-ids";
import { OfficeToolsConfigService } from "./office-tools-config.service";
import { OfficeToolsPaymentsService } from "./office-tools-payments.service";
import { OfficeToolsSyncService } from "./office-tools-sync.service";
import type { OfficeToolsConfig } from "./office-tools.types";

@Controller()
@RequireModule(ModuleIds.OfficeTools)
export class OfficeToolsSettingsController {
  constructor(
    private readonly config: OfficeToolsConfigService,
    private readonly sync: OfficeToolsSyncService,
    private readonly payments: OfficeToolsPaymentsService,
  ) {}

  @Get("settings/office-tools")
  @Roles(UserRole.ADMIN)
  getConfig() {
    return this.config.getConfig();
  }

  @Patch("settings/office-tools")
  @Roles(UserRole.ADMIN)
  setConfig(
    @Body() body: Partial<OfficeToolsConfig>,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.config.setConfig(body, req.user?.id);
  }

  @Get("settings/office-tools/status")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  status() {
    return this.sync.getStatus();
  }

  @Post("integrations/office-tools/sync")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  syncAll() {
    return this.sync.syncAll();
  }

  @Post("integrations/office-tools/sync/stock")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  syncStock() {
    return this.sync.syncStock();
  }

  @Post("integrations/office-tools/sync/payments")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  syncPayments(@Body() body?: { fromDate?: string }) {
    return this.sync.syncPayments(body?.fromDate);
  }

  @Post("integrations/office-tools/sync/receivables")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  syncReceivables() {
    return this.sync.syncReceivables();
  }

  @Get("integrations/office-tools/receipts/unmatched")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  unmatched(@Query("limit") limit?: string) {
    return this.payments.listUnmatched(limit ? Number(limit) : 100);
  }

  @Post("integrations/office-tools/receipts/:id/match")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  match(@Param("id") id: string, @Body() body: { orderId?: string }) {
    return this.payments.matchReceipt(id, String(body?.orderId ?? ""));
  }
}
