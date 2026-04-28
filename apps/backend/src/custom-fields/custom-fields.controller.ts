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
@Roles(UserRole.ADMIN)
@RequirePermission(PermissionKeys.CustomFieldsManage)
export class CustomFieldsController {
  constructor(private readonly customFields: CustomFieldsService) {}

  @Get("definitions")
  listDefinitions(@Query() query: Record<string, unknown>) {
    const parsed: CustomFieldDefinitionListQuery = {
      entityType: query.entityType !== undefined ? parseCustomFieldEntityType(query.entityType) : undefined,
      includeDeleted: parseBoolean(query.includeDeleted),
      includeInactive: parseBoolean(query.includeInactive),
    };
    return this.customFields.listDefinitions(parsed);
  }

  @Post("definitions")
  createDefinition(@Body() body: UpsertCustomFieldDefinitionDto) {
    return this.customFields.createDefinition(body);
  }

  @Get("definitions/:idOrKey")
  getDefinition(@Param("idOrKey") idOrKey: string) {
    return this.customFields.getDefinition(idOrKey);
  }

  @Patch("definitions/:idOrKey")
  updateDefinition(@Param("idOrKey") idOrKey: string, @Body() body: UpsertCustomFieldDefinitionDto) {
    return this.customFields.updateDefinition(idOrKey, body);
  }

  @Delete("definitions/:idOrKey")
  removeDefinition(@Param("idOrKey") idOrKey: string) {
    return this.customFields.softDeleteDefinition(idOrKey);
  }

  @Post("definitions/:idOrKey/options")
  createOption(@Param("idOrKey") idOrKey: string, @Body() body: UpsertCustomFieldOptionDto) {
    return this.customFields.createOption(idOrKey, body);
  }

  @Patch("definitions/:idOrKey/options/:optionIdOrKey")
  updateOption(
    @Param("idOrKey") idOrKey: string,
    @Param("optionIdOrKey") optionIdOrKey: string,
    @Body() body: UpsertCustomFieldOptionDto,
  ) {
    return this.customFields.updateOption(idOrKey, optionIdOrKey, body);
  }

  @Delete("definitions/:idOrKey/options/:optionIdOrKey")
  removeOption(@Param("idOrKey") idOrKey: string, @Param("optionIdOrKey") optionIdOrKey: string) {
    return this.customFields.softDeleteOption(idOrKey, optionIdOrKey);
  }

  @Get("values/:entityType/:entityId")
  listValues(@Param("entityType") entityType: string, @Param("entityId") entityId: string) {
    return this.customFields.listValues(entityType, entityId);
  }

  @Put("values/:definitionIdOrKey/:entityId")
  upsertValue(
    @Param("definitionIdOrKey") definitionIdOrKey: string,
    @Param("entityId") entityId: string,
    @Body() body: UpsertCustomFieldValueDto,
  ) {
    return this.customFields.upsertValue(definitionIdOrKey, entityId, body);
  }

  @Delete("values/:definitionIdOrKey/:entityId")
  clearValue(@Param("definitionIdOrKey") definitionIdOrKey: string, @Param("entityId") entityId: string) {
    return this.customFields.clearValue(definitionIdOrKey, entityId);
  }
}
