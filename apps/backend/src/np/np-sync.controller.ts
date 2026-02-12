import { Controller, Post } from "@nestjs/common";
import { Roles } from "../auth/roles.decorator";
import { UserRole } from "@prisma/client";
import { NpSyncService } from "./np-sync.service";

@Controller("np")
export class NpSyncController {
  constructor(private readonly sync: NpSyncService) {}

  @Roles(UserRole.ADMIN, UserRole.LEAD)
  @Post("sync")
  async syncAll() {
    return this.sync.syncAll();
  }
}
