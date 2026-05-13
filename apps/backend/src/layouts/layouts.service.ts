import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { CustomFieldEntityType, LayoutType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  normalizeColumns,
  normalizeLayoutKey,
  normalizeWidth,
  optionalInteger,
  optionalNullableString,
  optionalTrimmedString,
  parseLayoutEntityType,
  parseLayoutType,
  type LayoutListQuery,
  type UpsertLayoutDto,
  type UpsertLayoutFieldDto,
  type UpsertLayoutSectionDto,
} from "./dto/layouts.dto";

const LAYOUT_INCLUDE = {
  sections: {
    where: { deletedAt: null },
    orderBy: [{ sortOrder: "asc" as const }, { title: "asc" as const }],
    include: {
      fields: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: "asc" as const }, { key: "asc" as const }],
        include: {
          customFieldDefinition: true,
        },
      },
    },
  },
} satisfies Prisma.LayoutDefinitionInclude;

@Injectable()
export class LayoutsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: LayoutListQuery = {}) {
    const where: Prisma.LayoutDefinitionWhereInput = {};
    if (query.entityType !== undefined) where.entityType = query.entityType;
    if (query.type !== undefined) where.type = query.type;
    if (!query.includeDeleted) where.deletedAt = null;
    if (!query.includeInactive) where.isActive = true;

    const items = await this.prisma.layoutDefinition.findMany({
      where,
      include: LAYOUT_INCLUDE,
      orderBy: [{ entityType: "asc" }, { type: "asc" }, { name: "asc" }],
    });
    return { items };
  }

  async get(idOrKey: string, opts: { includeDeleted?: boolean } = {}) {
    const layout = await this.findLayout(idOrKey, opts);
    return { layout };
  }

  async create(body: UpsertLayoutDto) {
    const entityType = parseLayoutEntityType(body.entityType);
    const type = parseLayoutType(body.type);
    const key = normalizeLayoutKey(body.key);
    const name = optionalTrimmedString(body.name);
    if (!name) throw new BadRequestException("name is required");

    const layout = await this.prisma.layoutDefinition.create({
      data: {
        entityType,
        type,
        key,
        name,
        description: optionalNullableString(body.description),
        isDefault: body.isDefault === true,
        isActive: body.isActive !== false,
        settings: body.settings === undefined ? undefined : body.settings === null ? Prisma.JsonNull : body.settings,
      },
      include: LAYOUT_INCLUDE,
    });
    return { layout };
  }

  async update(idOrKey: string, body: UpsertLayoutDto) {
    const current = await this.findLayout(idOrKey);
    const data: Prisma.LayoutDefinitionUpdateInput = {};
    if (body.entityType !== undefined) data.entityType = parseLayoutEntityType(body.entityType);
    if (body.type !== undefined) data.type = parseLayoutType(body.type);
    if (body.key !== undefined) data.key = normalizeLayoutKey(body.key);
    if (body.name !== undefined) {
      const name = optionalTrimmedString(body.name);
      if (!name) throw new BadRequestException("name cannot be empty");
      data.name = name;
    }
    if (body.description !== undefined) data.description = optionalNullableString(body.description);
    if (body.isDefault !== undefined) data.isDefault = body.isDefault === true;
    if (body.isActive !== undefined) data.isActive = body.isActive === true;
    if (body.settings !== undefined) data.settings = body.settings === null ? Prisma.JsonNull : body.settings;

    const layout = await this.prisma.layoutDefinition.update({
      where: { id: current.id },
      data,
      include: LAYOUT_INCLUDE,
    });
    return { layout };
  }

  async softDelete(idOrKey: string) {
    const current = await this.findLayout(idOrKey);
    const layout = await this.prisma.layoutDefinition.update({
      where: { id: current.id },
      data: {
        isActive: false,
        deletedAt: new Date(),
        sections: {
          updateMany: {
            where: { deletedAt: null },
            data: { isActive: false, deletedAt: new Date() },
          },
        },
      },
      include: LAYOUT_INCLUDE,
    });
    return { layout };
  }

  async createSection(layoutIdOrKey: string, body: UpsertLayoutSectionDto) {
    const layout = await this.findLayout(layoutIdOrKey);
    const key = normalizeLayoutKey(body.key);
    const title = optionalTrimmedString(body.title);
    if (!title) throw new BadRequestException("title is required");

    const section = await this.prisma.layoutSection.create({
      data: {
        layoutId: layout.id,
        key,
        title,
        description: optionalNullableString(body.description),
        sortOrder: optionalInteger(body.sortOrder, "sortOrder") ?? 0,
        columns: normalizeColumns(body.columns) ?? 1,
        isActive: body.isActive !== false,
        settings: body.settings === undefined ? undefined : body.settings === null ? Prisma.JsonNull : body.settings,
      },
      include: { fields: true },
    });
    return { section };
  }

  async updateSection(layoutIdOrKey: string, sectionIdOrKey: string, body: UpsertLayoutSectionDto) {
    const layout = await this.findLayout(layoutIdOrKey);
    const current = await this.findSection(layout.id, sectionIdOrKey);
    const data: Prisma.LayoutSectionUpdateInput = {};
    if (body.key !== undefined) data.key = normalizeLayoutKey(body.key);
    if (body.title !== undefined) {
      const title = optionalTrimmedString(body.title);
      if (!title) throw new BadRequestException("title cannot be empty");
      data.title = title;
    }
    if (body.description !== undefined) data.description = optionalNullableString(body.description);
    if (body.sortOrder !== undefined) data.sortOrder = optionalInteger(body.sortOrder, "sortOrder");
    if (body.columns !== undefined) data.columns = normalizeColumns(body.columns);
    if (body.isActive !== undefined) data.isActive = body.isActive === true;
    if (body.settings !== undefined) data.settings = body.settings === null ? Prisma.JsonNull : body.settings;

    const section = await this.prisma.layoutSection.update({
      where: { id: current.id },
      data,
      include: { fields: true },
    });
    return { section };
  }

  async softDeleteSection(layoutIdOrKey: string, sectionIdOrKey: string) {
    const layout = await this.findLayout(layoutIdOrKey);
    const current = await this.findSection(layout.id, sectionIdOrKey);
    const section = await this.prisma.layoutSection.update({
      where: { id: current.id },
      data: {
        isActive: false,
        deletedAt: new Date(),
        fields: {
          updateMany: {
            where: { deletedAt: null },
            data: { hidden: true, deletedAt: new Date() },
          },
        },
      },
      include: { fields: true },
    });
    return { section };
  }

  async createField(layoutIdOrKey: string, sectionIdOrKey: string, body: UpsertLayoutFieldDto) {
    const { layout, section } = await this.findLayoutAndSection(layoutIdOrKey, sectionIdOrKey);
    const fieldRef = await this.normalizeFieldReference(layout.entityType, body);
    const key = body.key !== undefined ? normalizeLayoutKey(body.key) : fieldRef.key;

    const field = await this.prisma.layoutField.create({
      data: {
        sectionId: section.id,
        key,
        fieldKey: fieldRef.fieldKey,
        customFieldDefinitionId: fieldRef.customFieldDefinitionId,
        label: optionalNullableString(body.label),
        sortOrder: optionalInteger(body.sortOrder, "sortOrder") ?? 0,
        required: body.required === true,
        readonly: body.readonly === true,
        hidden: body.hidden === true,
        width: normalizeWidth(body.width),
        settings: body.settings === undefined ? undefined : body.settings === null ? Prisma.JsonNull : body.settings,
      },
      include: { customFieldDefinition: true },
    });
    return { field };
  }

  async updateField(layoutIdOrKey: string, sectionIdOrKey: string, fieldIdOrKey: string, body: UpsertLayoutFieldDto) {
    const { layout, section } = await this.findLayoutAndSection(layoutIdOrKey, sectionIdOrKey);
    const current = await this.findField(section.id, fieldIdOrKey);
    const data: Prisma.LayoutFieldUpdateInput = {};

    if (body.fieldKey !== undefined || body.customFieldDefinitionId !== undefined) {
      const fieldRef = await this.normalizeFieldReference(layout.entityType, body);
      data.fieldKey = fieldRef.fieldKey;
      data.customFieldDefinition = fieldRef.customFieldDefinitionId
        ? { connect: { id: fieldRef.customFieldDefinitionId } }
        : { disconnect: true };
      if (body.key === undefined) data.key = fieldRef.key;
    }
    if (body.key !== undefined) data.key = normalizeLayoutKey(body.key);
    if (body.label !== undefined) data.label = optionalNullableString(body.label);
    if (body.sortOrder !== undefined) data.sortOrder = optionalInteger(body.sortOrder, "sortOrder");
    if (body.required !== undefined) data.required = body.required === true;
    if (body.readonly !== undefined) data.readonly = body.readonly === true;
    if (body.hidden !== undefined) data.hidden = body.hidden === true;
    if (body.width !== undefined) data.width = normalizeWidth(body.width);
    if (body.settings !== undefined) data.settings = body.settings === null ? Prisma.JsonNull : body.settings;

    const field = await this.prisma.layoutField.update({
      where: { id: current.id },
      data,
      include: { customFieldDefinition: true },
    });
    return { field };
  }

  async softDeleteField(layoutIdOrKey: string, sectionIdOrKey: string, fieldIdOrKey: string) {
    const { section } = await this.findLayoutAndSection(layoutIdOrKey, sectionIdOrKey);
    const current = await this.findField(section.id, fieldIdOrKey);
    const field = await this.prisma.layoutField.update({
      where: { id: current.id },
      data: { hidden: true, deletedAt: new Date() },
      include: { customFieldDefinition: true },
    });
    return { field };
  }

  /**
   * Ensures a default TABLE layout exists for the entity (used to back the
   * "list columns" admin UI). Creates the layout + a single "columns" section
   * on first call; subsequent calls just return the existing layout.
   */
  async ensureDefaultListLayout(entityTypeRaw: unknown) {
    const entityType = parseLayoutEntityType(entityTypeRaw);
    const key = `${entityType.toLowerCase()}.list.default`;

    let layout = await this.prisma.layoutDefinition.findFirst({
      where: { entityType, type: LayoutType.TABLE, key, deletedAt: null },
      include: LAYOUT_INCLUDE,
    });

    if (!layout) {
      layout = await this.prisma.layoutDefinition.create({
        data: {
          entityType,
          type: LayoutType.TABLE,
          key,
          name: `${entityType} list columns`,
          description: "Default list columns configured by admin",
          isDefault: true,
          isActive: true,
          sections: {
            create: {
              key: "columns",
              title: "Columns",
              sortOrder: 0,
              columns: 1,
              isActive: true,
            },
          },
        },
        include: LAYOUT_INCLUDE,
      });
    } else if (layout.sections.length === 0) {
      await this.prisma.layoutSection.create({
        data: {
          layoutId: layout.id,
          key: "columns",
          title: "Columns",
          sortOrder: 0,
          columns: 1,
          isActive: true,
        },
      });
      layout = await this.prisma.layoutDefinition.findFirst({
        where: { id: layout.id },
        include: LAYOUT_INCLUDE,
      });
    }

    return { layout };
  }

  private async normalizeFieldReference(entityType: CustomFieldEntityType, body: UpsertLayoutFieldDto) {
    const fieldKey = optionalNullableString(body.fieldKey);
    const customFieldDefinitionId = optionalNullableString(body.customFieldDefinitionId);
    if (fieldKey && customFieldDefinitionId) {
      throw new BadRequestException("fieldKey and customFieldDefinitionId are mutually exclusive");
    }
    if (!fieldKey && !customFieldDefinitionId) {
      throw new BadRequestException("fieldKey or customFieldDefinitionId is required");
    }
    if (fieldKey) {
      const normalized = normalizeLayoutKey(fieldKey, "fieldKey");
      return { key: normalized, fieldKey: normalized, customFieldDefinitionId: null };
    }

    const customField = await this.prisma.customFieldDefinition.findFirst({
      where: { id: customFieldDefinitionId!, entityType, deletedAt: null },
      select: { id: true, key: true },
    });
    if (!customField) throw new BadRequestException("customFieldDefinitionId is invalid for this layout entity");
    return {
      key: `custom.${customField.key}`,
      fieldKey: null,
      customFieldDefinitionId: customField.id,
    };
  }

  private async findLayout(idOrKey: string, opts: { includeDeleted?: boolean } = {}) {
    const layout = await this.prisma.layoutDefinition.findFirst({
      where: {
        OR: [{ id: idOrKey }, { key: idOrKey }],
        ...(opts.includeDeleted ? {} : { deletedAt: null }),
      },
      include: LAYOUT_INCLUDE,
    });
    if (!layout) throw new NotFoundException("Layout not found");
    return layout;
  }

  private async findSection(layoutId: string, sectionIdOrKey: string) {
    const section = await this.prisma.layoutSection.findFirst({
      where: {
        layoutId,
        OR: [{ id: sectionIdOrKey }, { key: sectionIdOrKey }],
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!section) throw new NotFoundException("Layout section not found");
    return section;
  }

  private async findField(sectionId: string, fieldIdOrKey: string) {
    const field = await this.prisma.layoutField.findFirst({
      where: {
        sectionId,
        OR: [{ id: fieldIdOrKey }, { key: fieldIdOrKey }],
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!field) throw new NotFoundException("Layout field not found");
    return field;
  }

  private async findLayoutAndSection(layoutIdOrKey: string, sectionIdOrKey: string) {
    const layout = await this.findLayout(layoutIdOrKey);
    const section = await this.findSection(layout.id, sectionIdOrKey);
    return { layout, section };
  }
}
