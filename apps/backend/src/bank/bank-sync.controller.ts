import { Controller, Post } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { BankSyncService } from "./bank-sync.service";

@Controller("bank")
@Roles(UserRole.ADMIN)
export class BankSyncController {
  constructor(private readonly sync: BankSyncService) {}

  @Post("sync")
  async runSync() {
    return this.sync.syncAll();
  }
}
