import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { RequirePermission } from "../rbac/permissions.decorator";
import { PermissionKeys } from "../rbac/rbac.constants";
import { LayoutsService } from "./layouts.service";
import {
  parseLayoutEntityType,
  parseLayoutType,
  type LayoutListQuery,
  type UpsertLayoutDto,
  type UpsertLayoutFieldDto,
  type UpsertLayoutSectionDto,
} from "./dto/layouts.dto";

function parseBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return undefined;
}

@Controller("layouts")
@Roles(UserRole.ADMIN)
@RequirePermission(PermissionKeys.LayoutsManage)
export class LayoutsController {
  constructor(private readonly layouts: LayoutsService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    const parsed: LayoutListQuery = {
      entityType: query.entityType !== undefined ? parseLayoutEntityType(query.entityType) : undefined,
      type: query.type !== undefined ? parseLayoutType(query.type) : undefined,
      includeDeleted: parseBoolean(query.includeDeleted),
      includeInactive: parseBoolean(query.includeInactive),
    };
    return this.layouts.list(parsed);
  }

  @Post()
  create(@Body() body: UpsertLayoutDto) {
    return this.layouts.create(body);
  }

  @Get(":idOrKey")
  get(@Param("idOrKey") idOrKey: string, @Query("includeDeleted") includeDeleted?: string) {
    return this.layouts.get(idOrKey, { includeDeleted: parseBoolean(includeDeleted) });
  }

  @Patch(":idOrKey")
  update(@Param("idOrKey") idOrKey: string, @Body() body: UpsertLayoutDto) {
    return this.layouts.update(idOrKey, body);
  }

  @Delete(":idOrKey")
  remove(@Param("idOrKey") idOrKey: string) {
    return this.layouts.softDelete(idOrKey);
  }

  @Post(":idOrKey/sections")
  createSection(@Param("idOrKey") idOrKey: string, @Body() body: UpsertLayoutSectionDto) {
    return this.layouts.createSection(idOrKey, body);
  }

  @Patch(":idOrKey/sections/:sectionIdOrKey")
  updateSection(
    @Param("idOrKey") idOrKey: string,
    @Param("sectionIdOrKey") sectionIdOrKey: string,
    @Body() body: UpsertLayoutSectionDto,
  ) {
    return this.layouts.updateSection(idOrKey, sectionIdOrKey, body);
  }

  @Delete(":idOrKey/sections/:sectionIdOrKey")
  removeSection(@Param("idOrKey") idOrKey: string, @Param("sectionIdOrKey") sectionIdOrKey: string) {
    return this.layouts.softDeleteSection(idOrKey, sectionIdOrKey);
  }

  @Post(":idOrKey/sections/:sectionIdOrKey/fields")
  createField(
    @Param("idOrKey") idOrKey: string,
    @Param("sectionIdOrKey") sectionIdOrKey: string,
    @Body() body: UpsertLayoutFieldDto,
  ) {
    return this.layouts.createField(idOrKey, sectionIdOrKey, body);
  }

  @Patch(":idOrKey/sections/:sectionIdOrKey/fields/:fieldIdOrKey")
  updateField(
    @Param("idOrKey") idOrKey: string,
    @Param("sectionIdOrKey") sectionIdOrKey: string,
    @Param("fieldIdOrKey") fieldIdOrKey: string,
    @Body() body: UpsertLayoutFieldDto,
  ) {
    return this.layouts.updateField(idOrKey, sectionIdOrKey, fieldIdOrKey, body);
  }

  @Delete(":idOrKey/sections/:sectionIdOrKey/fields/:fieldIdOrKey")
  removeField(
    @Param("idOrKey") idOrKey: string,
    @Param("sectionIdOrKey") sectionIdOrKey: string,
    @Param("fieldIdOrKey") fieldIdOrKey: string,
  ) {
    return this.layouts.softDeleteField(idOrKey, sectionIdOrKey, fieldIdOrKey);
  }
}
