import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { RequirePermission } from "../rbac/permissions.decorator";
import { PermissionKeys } from "../rbac/rbac.constants";
import { CustomEntitiesService } from "./custom-entities.service";

@Controller("custom-entities")
export class CustomEntitiesController {
  constructor(private readonly customEntities: CustomEntitiesService) {}

  @Get("definitions")
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD)
  @RequirePermission(PermissionKeys.MetadataRead)
  listDefinitions() {
    return this.customEntities.listDefinitions();
  }

  @Post("definitions")
  @Roles(UserRole.ADMIN)
  @RequirePermission(PermissionKeys.MetadataWrite)
  createDefinition(
    @Body() body: { key: string; name: string; pluralName?: string | null; description?: string | null },
  ) {
    return this.customEntities.createDefinition(body);
  }

  @Get("definitions/:key/records")
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD)
  @RequirePermission(PermissionKeys.MetadataRead)
  listRecords(@Param("key") key: string) {
    return this.customEntities.listRecords(key);
  }

  @Post("definitions/:key/records")
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD)
  @RequirePermission(PermissionKeys.MetadataWrite)
  createRecord(@Param("key") key: string, @Body() body: { data?: Record<string, unknown> }) {
    return this.customEntities.createRecord(key, body);
  }

  @Patch("records/:id")
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD)
  @RequirePermission(PermissionKeys.MetadataWrite)
  updateRecord(@Param("id") id: string, @Body() body: { data: Record<string, unknown> }) {
    return this.customEntities.updateRecord(id, body);
  }
}
