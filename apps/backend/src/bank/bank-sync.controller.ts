import { Controller, ForbiddenException, Get, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { Roles } from "../auth/roles.decorator";
import { BankAccountsService } from "./bank-accounts.service";
import { BankSyncService } from "./bank-sync.service";

@Controller("bank")
export class BankSyncController {
  constructor(
    private readonly sync: BankSyncService,
    private readonly bankAccounts: BankAccountsService,
  ) {}

  @Post("sync")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  async runSync(
    @Query("bankAccountId") bankAccountId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Req() req?: Request & { user?: AuthUser },
  ) {
    const user = req?.user;
    const id = bankAccountId || undefined;
    if (!user || user.role === UserRole.ADMIN) {
      return this.sync.syncAll(id, from, to);
    }
    const visible = await this.bankAccounts.getVisibleBankAccountIds(user.id);
    if (id && !visible.includes(id)) {
      throw new ForbiddenException("You do not have access to this bank account");
    }
    return this.sync.syncAll(id, from, to, visible);
  }

  @Get("sync/status")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  async getSyncStatus(@Req() req?: Request & { user?: AuthUser }) {
    const user = req?.user;
    if (!user || user.role === UserRole.ADMIN) {
      return this.sync.getSyncStatus();
    }
    const visible = await this.bankAccounts.getVisibleBankAccountIds(user.id);
    return this.sync.getSyncStatus(visible);
  }
}
