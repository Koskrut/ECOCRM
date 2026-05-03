import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
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

  @Post("roles")
  createRole(
    @Body()
    body: { key: string; name: string; description?: string | null; permissionKeys: string[] },
  ) {
    return this.rbac.createCustomRole(body);
  }

  @Patch("roles/:id")
  updateRole(
    @Param("id") id: string,
    @Body()
    body: { name?: string; description?: string | null; isActive?: boolean; permissionKeys?: string[] },
  ) {
    return this.rbac.updateCustomRole(id, body);
  }

  @Delete("roles/:id")
  deleteRole(@Param("id") id: string) {
    return this.rbac.softDeleteCustomRole(id);
  }

  @Post("users/:userId/roles")
  assignRole(@Param("userId") userId: string, @Body() body: { roleId: string }) {
    return this.rbac.assignRoleToUser(userId, body.roleId);
  }

  @Delete("users/:userId/roles/:roleId")
  removeRole(@Param("userId") userId: string, @Param("roleId") roleId: string) {
    return this.rbac.removeRoleFromUser(userId, roleId);
  }

  @Get("users/:userId/assignments")
  listAssignments(@Param("userId") userId: string) {
    return this.rbac.listAssignmentsForUser(userId);
  }

  @Get("users/:userId/effective")
  effective(@Param("userId") userId: string) {
    return this.rbac.effectiveForUser(userId);
  }
}
