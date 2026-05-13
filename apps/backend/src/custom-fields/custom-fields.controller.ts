import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { RequirePermission } from "../rbac/permissions.decorator";
import { PermissionKeys } from "../rbac/rbac.constants";
import { CustomFieldsService } from "./custom-fields.service";
import {
  parseCustomFieldEntityType,
  type CustomFieldDefinitionListQuery,
  type UpsertCustomFieldDefinitionDto,
  type UpsertCustomFieldOptionDto,
  type UpsertCustomFieldValueDto,
} from "./dto/custom-fields.dto";

function parseBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return undefined;
}

@Controller("custom-fields")
export class CustomFieldsController {
  constructor(private readonly customFields: CustomFieldsService) {}

  @Get("definitions")
  @Roles(UserRole.ADMIN)
  @RequirePermission(PermissionKeys.CustomFieldsManage)
  listDefinitions(@Query() query: Record<string, unknown>) {
    const parsed: CustomFieldDefinitionListQuery = {
      entityType: query.entityType !== undefined ? parseCustomFieldEntityType(query.entityType) : undefined,
      includeDeleted: parseBoolean(query.includeDeleted),
      includeInactive: parseBoolean(query.includeInactive),
    };
    return this.customFields.listDefinitions(parsed);
  }

  /** Active definitions for one entity type — MetadataRead (UI forms); no admin-only fields. */
  @Get("field-schema")
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.USER)
  @RequirePermission(PermissionKeys.MetadataRead)
  listFieldSchema(@Query("entityType") entityType: string) {
    return this.customFields.listFieldSchema(entityType);
  }

  @Post("definitions")
  @Roles(UserRole.ADMIN)
  @RequirePermission(PermissionKeys.CustomFieldsManage)
  createDefinition(@Body() body: UpsertCustomFieldDefinitionDto) {
    return this.customFields.createDefinition(body);
  }

  @Get("definitions/:idOrKey")
  @Roles(UserRole.ADMIN)
  @RequirePermission(PermissionKeys.CustomFieldsManage)
  getDefinition(@Param("idOrKey") idOrKey: string) {
    return this.customFields.getDefinition(idOrKey);
  }

  @Patch("definitions/:idOrKey")
  @Roles(UserRole.ADMIN)
  @RequirePermission(PermissionKeys.CustomFieldsManage)
  updateDefinition(@Param("idOrKey") idOrKey: string, @Body() body: UpsertCustomFieldDefinitionDto) {
    return this.customFields.updateDefinition(idOrKey, body);
  }

  @Delete("definitions/:idOrKey")
  @Roles(UserRole.ADMIN)
  @RequirePermission(PermissionKeys.CustomFieldsManage)
  removeDefinition(@Param("idOrKey") idOrKey: string) {
    return this.customFields.softDeleteDefinition(idOrKey);
  }

  @Post("definitions/:idOrKey/options")
  @Roles(UserRole.ADMIN)
  @RequirePermission(PermissionKeys.CustomFieldsManage)
  createOption(@Param("idOrKey") idOrKey: string, @Body() body: UpsertCustomFieldOptionDto) {
    return this.customFields.createOption(idOrKey, body);
  }

  @Patch("definitions/:idOrKey/options/:optionIdOrKey")
  @Roles(UserRole.ADMIN)
  @RequirePermission(PermissionKeys.CustomFieldsManage)
  updateOption(
    @Param("idOrKey") idOrKey: string,
    @Param("optionIdOrKey") optionIdOrKey: string,
    @Body() body: UpsertCustomFieldOptionDto,
  ) {
    return this.customFields.updateOption(idOrKey, optionIdOrKey, body);
  }

  @Delete("definitions/:idOrKey/options/:optionIdOrKey")
  @Roles(UserRole.ADMIN)
  @RequirePermission(PermissionKeys.CustomFieldsManage)
  removeOption(@Param("idOrKey") idOrKey: string, @Param("optionIdOrKey") optionIdOrKey: string) {
    return this.customFields.softDeleteOption(idOrKey, optionIdOrKey);
  }

  @Get("values/:entityType/:entityId")
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.USER)
  @RequirePermission(PermissionKeys.MetadataRead)
  listValues(@Param("entityType") entityType: string, @Param("entityId") entityId: string) {
    return this.customFields.listValues(entityType, entityId);
  }

  @Post("values/batch")
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.USER)
  @RequirePermission(PermissionKeys.MetadataRead)
  batchValues(@Body() body: { entityType?: unknown; entityIds?: unknown; definitionKeys?: unknown }) {
    return this.customFields.batchValues(body ?? {});
  }

  @Put("values/:definitionIdOrKey/:entityId")
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD)
  @RequirePermission(PermissionKeys.MetadataWrite)
  upsertValue(
    @Param("definitionIdOrKey") definitionIdOrKey: string,
    @Param("entityId") entityId: string,
    @Body() body: UpsertCustomFieldValueDto,
  ) {
    return this.customFields.upsertValue(definitionIdOrKey, entityId, body);
  }

  @Delete("values/:definitionIdOrKey/:entityId")
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD)
  @RequirePermission(PermissionKeys.MetadataWrite)
  clearValue(@Param("definitionIdOrKey") definitionIdOrKey: string, @Param("entityId") entityId: string) {
    return this.customFields.clearValue(definitionIdOrKey, entityId);
  }
}
