import { Controller, Post } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { RequireModule } from "../modules/gating/require-module.decorator";
import { ModuleIds } from "../modules/module-ids";
import type { NpSyncService } from "./np-sync.service";

@Controller("np")
@RequireModule(ModuleIds.NovaPoshta)
export class NpSyncController {
  constructor(private readonly sync: NpSyncService) {}

  @Roles(UserRole.ADMIN, UserRole.LEAD)
  @Post("sync")
  async syncAll() {
    return this.sync.syncAll();
  }
}
