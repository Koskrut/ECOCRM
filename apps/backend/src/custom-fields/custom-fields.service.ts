import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { CustomFieldType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  normalizeCustomFieldKey,
  normalizeCustomFieldValue,
  optionalInteger,
  optionalNullableString,
  optionalTrimmedString,
  parseCustomFieldEntityType,
  parseCustomFieldType,
  type CustomFieldDefinitionListQuery,
  type UpsertCustomFieldDefinitionDto,
  type UpsertCustomFieldOptionDto,
  type UpsertCustomFieldValueDto,
} from "./dto/custom-fields.dto";
import { mapDefinitionToFieldSchema } from "./custom-fields-ui-schema";

const DEFINITION_INCLUDE = {
  dictionary: { select: { id: true, key: true, name: true } },
  options: {
    where: { deletedAt: null },
    orderBy: [{ sortOrder: "asc" as const }, { label: "asc" as const }],
  },
} satisfies Prisma.CustomFieldDefinitionInclude;

@Injectable()
export class CustomFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  async listDefinitions(query: CustomFieldDefinitionListQuery = {}) {
    const where: Prisma.CustomFieldDefinitionWhereInput = {};
    if (query.entityType !== undefined) where.entityType = query.entityType;
    if (!query.includeDeleted) where.deletedAt = null;
    if (!query.includeInactive) where.isActive = true;

    const items = await this.prisma.customFieldDefinition.findMany({
      where,
      include: DEFINITION_INCLUDE,
      orderBy: [{ entityType: "asc" }, { label: "asc" }],
    });
    return { items };
  }

  /** Active field definitions for one entity — safe for MetadataRead (forms, lists). */
  async listFieldSchema(entityTypeRaw: unknown) {
    if (entityTypeRaw === undefined || entityTypeRaw === null || String(entityTypeRaw).trim() === "") {
      throw new BadRequestException("entityType query parameter is required");
    }
    const entityType = parseCustomFieldEntityType(entityTypeRaw);
    const rows = await this.prisma.customFieldDefinition.findMany({
      where: { entityType, deletedAt: null, isActive: true },
      include: DEFINITION_INCLUDE,
      orderBy: [{ label: "asc" }],
    });
    return { items: rows.map(mapDefinitionToFieldSchema) };
  }

  async getDefinition(idOrKey: string) {
    const definition = await this.findDefinition(idOrKey, { includeDeleted: true });
    return { definition };
  }

  async createDefinition(body: UpsertCustomFieldDefinitionDto) {
    const entityType = parseCustomFieldEntityType(body.entityType);
    const type = parseCustomFieldType(body.type);
    const key = normalizeCustomFieldKey(body.key);
    const label = optionalTrimmedString(body.label);
    if (!label) throw new BadRequestException("label is required");

    await this.validateDefinitionReferences(type, body.dictionaryId);

    const definition = await this.prisma.customFieldDefinition.create({
      data: {
        entityType,
        type,
        key,
        label,
        description: optionalNullableString(body.description),
        required: body.required === true,
        isActive: body.isActive !== false,
        system: body.system === true,
        dictionaryId: optionalNullableString(body.dictionaryId),
        settings: body.settings === undefined ? undefined : body.settings === null ? Prisma.JsonNull : body.settings,
      },
      include: DEFINITION_INCLUDE,
    });
    return { definition };
  }

  async updateDefinition(idOrKey: string, body: UpsertCustomFieldDefinitionDto) {
    const current = await this.findDefinition(idOrKey);
    const nextType = body.type !== undefined ? parseCustomFieldType(body.type) : current.type;
    const nextDictionaryId = body.dictionaryId !== undefined ? optionalNullableString(body.dictionaryId) : current.dictionaryId;
    await this.validateDefinitionReferences(nextType, nextDictionaryId);

    const data: Prisma.CustomFieldDefinitionUpdateInput = {};
    if (body.entityType !== undefined) data.entityType = parseCustomFieldEntityType(body.entityType);
    if (body.type !== undefined) data.type = nextType;
    if (body.key !== undefined) data.key = normalizeCustomFieldKey(body.key);
    if (body.label !== undefined) {
      const label = optionalTrimmedString(body.label);
      if (!label) throw new BadRequestException("label cannot be empty");
      data.label = label;
    }
    if (body.description !== undefined) data.description = optionalNullableString(body.description);
    if (body.required !== undefined) data.required = body.required === true;
    if (body.isActive !== undefined) data.isActive = body.isActive === true;
    if (body.system !== undefined) data.system = body.system === true;
    if (body.dictionaryId !== undefined) data.dictionary = nextDictionaryId ? { connect: { id: nextDictionaryId } } : { disconnect: true };
    if (body.settings !== undefined) data.settings = body.settings === null ? Prisma.JsonNull : body.settings;

    const definition = await this.prisma.customFieldDefinition.update({
      where: { id: current.id },
      data,
      include: DEFINITION_INCLUDE,
    });
    return { definition };
  }

  async softDeleteDefinition(idOrKey: string) {
    const current = await this.findDefinition(idOrKey);
    const definition = await this.prisma.customFieldDefinition.update({
      where: { id: current.id },
      data: {
        isActive: false,
        deletedAt: new Date(),
        options: {
          updateMany: {
            where: { deletedAt: null },
            data: { isActive: false, deletedAt: new Date() },
          },
        },
      },
      include: DEFINITION_INCLUDE,
    });
    return { definition };
  }

  async createOption(definitionIdOrKey: string, body: UpsertCustomFieldOptionDto) {
    const definition = await this.findDefinition(definitionIdOrKey);
    if (definition.type !== CustomFieldType.SELECT && definition.type !== CustomFieldType.MULTISELECT) {
      throw new BadRequestException("options are only supported for SELECT and MULTISELECT fields");
    }

    const key = normalizeCustomFieldKey(body.key);
    const label = optionalTrimmedString(body.label);
    if (!label) throw new BadRequestException("label is required");

    const option = await this.prisma.customFieldOption.create({
      data: {
        definitionId: definition.id,
        key,
        label,
        value: optionalNullableString(body.value),
        sortOrder: optionalInteger(body.sortOrder) ?? 0,
        isActive: body.isActive !== false,
        metadata: body.metadata === undefined ? undefined : body.metadata === null ? Prisma.JsonNull : body.metadata,
      },
    });
    return { option };
  }

  async updateOption(definitionIdOrKey: string, optionIdOrKey: string, body: UpsertCustomFieldOptionDto) {
    const definition = await this.findDefinition(definitionIdOrKey);
    const current = await this.findOption(definition.id, optionIdOrKey);
    const data: Prisma.CustomFieldOptionUpdateInput = {};
    if (body.key !== undefined) data.key = normalizeCustomFieldKey(body.key);
    if (body.label !== undefined) {
      const label = optionalTrimmedString(body.label);
      if (!label) throw new BadRequestException("label cannot be empty");
      data.label = label;
    }
    if (body.value !== undefined) data.value = optionalNullableString(body.value);
    if (body.sortOrder !== undefined) data.sortOrder = optionalInteger(body.sortOrder);
    if (body.isActive !== undefined) data.isActive = body.isActive === true;
    if (body.metadata !== undefined) data.metadata = body.metadata === null ? Prisma.JsonNull : body.metadata;

    const option = await this.prisma.customFieldOption.update({ where: { id: current.id }, data });
    return { option };
  }

  async softDeleteOption(definitionIdOrKey: string, optionIdOrKey: string) {
    const definition = await this.findDefinition(definitionIdOrKey);
    const current = await this.findOption(definition.id, optionIdOrKey);
    const option = await this.prisma.customFieldOption.update({
      where: { id: current.id },
      data: { isActive: false, deletedAt: new Date() },
    });
    return { option };
  }

  async listValues(entityTypeRaw: string, entityId: string) {
    const entityType = parseCustomFieldEntityType(entityTypeRaw);
    const items = await this.prisma.customFieldValue.findMany({
      where: { entityType, entityId },
      include: {
        definition: true,
        dictionaryItem: true,
      },
      orderBy: { definition: { label: "asc" } },
    });
    return { items };
  }

  async batchValues(body: { entityType?: unknown; entityIds?: unknown; definitionKeys?: unknown }) {
    const entityType = parseCustomFieldEntityType(body.entityType);
    const idsInput = Array.isArray(body.entityIds) ? body.entityIds : [];
    const entityIds = Array.from(
      new Set(
        idsInput
          .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
          .map((v) => v.trim()),
      ),
    );
    if (entityIds.length === 0) {
      return { byEntityId: {} as Record<string, Record<string, unknown>>, definitions: [] };
    }
    if (entityIds.length > 500) {
      throw new BadRequestException("entityIds must contain at most 500 ids");
    }

    const keys = Array.isArray(body.definitionKeys)
      ? body.definitionKeys.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      : null;

    let definitionFilter: Prisma.CustomFieldValueWhereInput["definition"] | undefined;
    if (keys && keys.length > 0) {
      definitionFilter = { entityType, deletedAt: null, key: { in: keys } };
    } else {
      definitionFilter = { entityType, deletedAt: null };
    }

    const rows = await this.prisma.customFieldValue.findMany({
      where: {
        entityType,
        entityId: { in: entityIds },
        definition: definitionFilter,
      },
      include: {
        definition: true,
        dictionaryItem: { select: { id: true, key: true, label: true, value: true } },
      },
    });

    const byEntityId: Record<string, Record<string, unknown>> = {};
    const definitionsById = new Map<string, { id: string; key: string; type: CustomFieldType }>();

    for (const row of rows) {
      const bag = (byEntityId[row.entityId] ||= {});
      const def = row.definition;
      definitionsById.set(def.id, { id: def.id, key: def.key, type: def.type });

      let display: unknown = null;
      switch (def.type) {
        case CustomFieldType.TEXT:
        case CustomFieldType.SELECT:
        case CustomFieldType.USER:
          display = row.valueString;
          break;
        case CustomFieldType.NUMBER:
        case CustomFieldType.MONEY:
          display = row.valueNumber;
          break;
        case CustomFieldType.BOOLEAN:
          display = row.valueBoolean;
          break;
        case CustomFieldType.DATE:
          display = row.valueDate ? row.valueDate.toISOString() : null;
          break;
        case CustomFieldType.MULTISELECT:
        case CustomFieldType.JSON:
          display = row.valueJson;
          break;
        case CustomFieldType.DICTIONARY_ITEM:
          display = row.dictionaryItem
            ? { id: row.dictionaryItem.id, label: row.dictionaryItem.label, value: row.dictionaryItem.value }
            : null;
          break;
        default:
          display = null;
      }

      bag[def.key] = display;
    }

    return {
      byEntityId,
      definitions: Array.from(definitionsById.values()),
    };
  }

  async upsertValue(definitionIdOrKey: string, entityId: string, body: UpsertCustomFieldValueDto) {
    const definition = await this.findDefinition(definitionIdOrKey);
    const value = normalizeCustomFieldValue(definition.type, body.value);
    await this.validateValueReferences(definition, value.dictionaryItemId);

    const valueJson = value.valueJson === null ? Prisma.JsonNull : value.valueJson;
    const data = {
      entityType: definition.entityType,
      entityId,
      valueString: value.valueString,
      valueNumber: value.valueNumber,
      valueBoolean: value.valueBoolean,
      valueDate: value.valueDate,
      valueJson,
      dictionaryItemId: value.dictionaryItemId,
    };

    const fieldValue = await this.prisma.customFieldValue.upsert({
      where: { definitionId_entityId: { definitionId: definition.id, entityId } },
      create: { definitionId: definition.id, ...data },
      update: data,
      include: { definition: true, dictionaryItem: true },
    });
    return { value: fieldValue };
  }

  async clearValue(definitionIdOrKey: string, entityId: string) {
    const definition = await this.findDefinition(definitionIdOrKey);
    await this.prisma.customFieldValue.deleteMany({ where: { definitionId: definition.id, entityId } });
    return { ok: true };
  }

  private async validateDefinitionReferences(type: CustomFieldType, dictionaryId: string | null | undefined) {
    if (type === CustomFieldType.DICTIONARY_ITEM && !dictionaryId) {
      throw new BadRequestException("dictionaryId is required for DICTIONARY_ITEM fields");
    }
    if (dictionaryId) {
      const dictionary = await this.prisma.dictionary.findFirst({
        where: { id: dictionaryId, deletedAt: null },
        select: { id: true },
      });
      if (!dictionary) throw new BadRequestException("dictionaryId is invalid");
    }
  }

  private async validateValueReferences(
    definition: { type: CustomFieldType; dictionaryId: string | null },
    dictionaryItemId: string | null,
  ) {
    if (definition.type !== CustomFieldType.DICTIONARY_ITEM || !dictionaryItemId) return;
    const item = await this.prisma.dictionaryItem.findFirst({
      where: {
        id: dictionaryItemId,
        dictionaryId: definition.dictionaryId ?? undefined,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!item) throw new BadRequestException("dictionary item is invalid");
  }

  private async findDefinition(idOrKey: string, opts: { includeDeleted?: boolean } = {}) {
    const definition = await this.prisma.customFieldDefinition.findFirst({
      where: {
        OR: [{ id: idOrKey }, { key: idOrKey }],
        ...(opts.includeDeleted ? {} : { deletedAt: null }),
      },
      include: DEFINITION_INCLUDE,
    });
    if (!definition) throw new NotFoundException("Custom field definition not found");
    return definition;
  }

  private async findOption(definitionId: string, optionIdOrKey: string) {
    const option = await this.prisma.customFieldOption.findFirst({
      where: {
        definitionId,
        OR: [{ id: optionIdOrKey }, { key: optionIdOrKey }],
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!option) throw new NotFoundException("Custom field option not found");
    return option;
  }
}
