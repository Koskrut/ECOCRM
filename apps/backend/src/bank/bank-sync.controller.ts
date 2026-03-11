import { Controller, Get, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { BankSyncService } from "./bank-sync.service";

@Controller("bank")
@Roles(UserRole.ADMIN)
export class BankSyncController {
  constructor(private readonly sync: BankSyncService) {}

  @Post("sync")
  async runSync(
    @Query("bankAccountId") bankAccountId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.sync.syncAll(bankAccountId || undefined, from, to);
  }

  @Get("sync/status")
  getSyncStatus() {
    return this.sync.getSyncStatus();
  }
}
