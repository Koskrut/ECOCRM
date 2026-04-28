import { Controller, Get, Post } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { RequirePermission } from "./permissions.decorator";
import { PermissionKeys } from "./rbac.constants";
import { RbacService } from "./rbac.service";

@Controller("rbac")
@Roles(UserRole.ADMIN)
@RequirePermission(PermissionKeys.SystemManage)
export class RbacController {
  constructor(private readonly rbac: RbacService) {}

  @Get()
  listCatalog() {
    return this.rbac.listCatalog();
  }

  @Post("sync-defaults")
  syncDefaults() {
    return this.rbac.syncDefaultCatalog();
  }
}
