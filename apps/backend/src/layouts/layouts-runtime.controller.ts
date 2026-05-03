import { Controller, Get, Query } from "@nestjs/common";
import { LayoutType, UserRole } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { RequirePermission } from "../rbac/permissions.decorator";
import { PermissionKeys } from "../rbac/rbac.constants";
import { LayoutsService } from "./layouts.service";
import { parseLayoutEntityType, parseLayoutType } from "./dto/layouts.dto";

/**
 * Read-only layouts for CRM runtime (cards, tables) — MetadataRead, not LayoutsManage.
 */
@Controller("layouts/runtime")
export class LayoutsRuntimeController {
  constructor(private readonly layouts: LayoutsService) {}

  @Get("list")
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.USER)
  @RequirePermission(PermissionKeys.MetadataRead)
  list(
    @Query("entityType") entityType: string,
    @Query("type") type?: string,
  ) {
    if (!entityType) {
      return { items: [] };
    }
    return this.layouts.list({
      entityType: parseLayoutEntityType(entityType),
      type: type !== undefined ? parseLayoutType(type) : LayoutType.CARD,
      includeDeleted: false,
      includeInactive: false,
    });
  }
}
