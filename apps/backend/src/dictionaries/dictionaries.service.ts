import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  normalizeDictionaryKey,
  optionalBoolean,
  optionalInteger,
  optionalNullableString,
  optionalTrimmedString,
  type DictionaryListQuery,
  type UpsertDictionaryDto,
  type UpsertDictionaryItemDto,
} from "./dto/dictionaries.dto";

const DICTIONARY_SELECT = {
  id: true,
  key: true,
  name: true,
  description: true,
  system: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  _count: { select: { items: true } },
} satisfies Prisma.DictionarySelect;

const DICTIONARY_WITH_ITEMS_INCLUDE = {
  items: {
    where: { deletedAt: null },
    orderBy: [{ sortOrder: "asc" as const }, { label: "asc" as const }],
  },
} satisfies Prisma.DictionaryInclude;

@Injectable()
export class DictionariesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: DictionaryListQuery = {}) {
    const where: Prisma.DictionaryWhereInput = {};
    if (!query.includeDeleted) where.deletedAt = null;
    if (!query.includeInactive) where.isActive = true;
    if (query.system !== undefined) where.system = query.system;
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { key: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

    const items = await this.prisma.dictionary.findMany({
      where,
      select: DICTIONARY_SELECT,
      orderBy: [{ system: "desc" }, { name: "asc" }],
    });
    return { items };
  }

  async get(idOrKey: string, opts: { includeDeleted?: boolean } = {}) {
    const dictionary = await this.prisma.dictionary.findFirst({
      where: {
        OR: [{ id: idOrKey }, { key: idOrKey }],
        ...(opts.includeDeleted ? {} : { deletedAt: null }),
      },
      include: DICTIONARY_WITH_ITEMS_INCLUDE,
    });
    if (!dictionary) throw new NotFoundException("Dictionary not found");
    return { dictionary };
  }

  async create(body: UpsertDictionaryDto) {
    const key = normalizeDictionaryKey(body.key);
    const name = optionalTrimmedString(body.name);
    if (!name) throw new BadRequestException("name is required");

    const dictionary = await this.prisma.dictionary.create({
      data: {
        key,
        name,
        description: optionalNullableString(body.description),
        system: body.system === true,
        isActive: body.isActive !== false,
      },
      include: DICTIONARY_WITH_ITEMS_INCLUDE,
    });
    return { dictionary };
  }

  async update(idOrKey: string, body: UpsertDictionaryDto) {
    const current = await this.findDictionaryForMutation(idOrKey);
    const data: Prisma.DictionaryUpdateInput = {};
    if (body.key !== undefined) data.key = normalizeDictionaryKey(body.key);
    if (body.name !== undefined) {
      const name = optionalTrimmedString(body.name);
      if (!name) throw new BadRequestException("name cannot be empty");
      data.name = name;
    }
    if (body.description !== undefined) data.description = optionalNullableString(body.description);
    if (body.system !== undefined) data.system = optionalBoolean(body.system);
    if (body.isActive !== undefined) data.isActive = optionalBoolean(body.isActive);

    const dictionary = await this.prisma.dictionary.update({
      where: { id: current.id },
      data,
      include: DICTIONARY_WITH_ITEMS_INCLUDE,
    });
    return { dictionary };
  }

  async softDelete(idOrKey: string) {
    const current = await this.findDictionaryForMutation(idOrKey);
    const dictionary = await this.prisma.dictionary.update({
      where: { id: current.id },
      data: {
        isActive: false,
        deletedAt: new Date(),
        items: {
          updateMany: {
            where: { deletedAt: null },
            data: { isActive: false, deletedAt: new Date() },
          },
        },
      },
      include: DICTIONARY_WITH_ITEMS_INCLUDE,
    });
    return { dictionary };
  }

  async createItem(dictionaryIdOrKey: string, body: UpsertDictionaryItemDto) {
    const dictionary = await this.findDictionaryForMutation(dictionaryIdOrKey);
    const key = normalizeDictionaryKey(body.key);
    const label = optionalTrimmedString(body.label);
    if (!label) throw new BadRequestException("label is required");

    const item = await this.prisma.dictionaryItem.create({
      data: {
        dictionaryId: dictionary.id,
        key,
        label,
        value: optionalNullableString(body.value),
        sortOrder: optionalInteger(body.sortOrder) ?? 0,
        isActive: body.isActive !== false,
        metadata: body.metadata === undefined ? undefined : body.metadata === null ? Prisma.JsonNull : body.metadata,
      },
    });
    return { item };
  }

  async updateItem(dictionaryIdOrKey: string, itemIdOrKey: string, body: UpsertDictionaryItemDto) {
    const dictionary = await this.findDictionaryForMutation(dictionaryIdOrKey);
    const current = await this.findItemForMutation(dictionary.id, itemIdOrKey);
    const data: Prisma.DictionaryItemUpdateInput = {};
    if (body.key !== undefined) data.key = normalizeDictionaryKey(body.key);
    if (body.label !== undefined) {
      const label = optionalTrimmedString(body.label);
      if (!label) throw new BadRequestException("label cannot be empty");
      data.label = label;
    }
    if (body.value !== undefined) data.value = optionalNullableString(body.value);
    if (body.sortOrder !== undefined) data.sortOrder = optionalInteger(body.sortOrder);
    if (body.isActive !== undefined) data.isActive = optionalBoolean(body.isActive);
    if (body.metadata !== undefined) data.metadata = body.metadata === null ? Prisma.JsonNull : body.metadata;

    const item = await this.prisma.dictionaryItem.update({
      where: { id: current.id },
      data,
    });
    return { item };
  }

  async softDeleteItem(dictionaryIdOrKey: string, itemIdOrKey: string) {
    const dictionary = await this.findDictionaryForMutation(dictionaryIdOrKey);
    const current = await this.findItemForMutation(dictionary.id, itemIdOrKey);
    const item = await this.prisma.dictionaryItem.update({
      where: { id: current.id },
      data: { isActive: false, deletedAt: new Date() },
    });
    return { item };
  }

  private async findDictionaryForMutation(idOrKey: string) {
    const dictionary = await this.prisma.dictionary.findFirst({
      where: { OR: [{ id: idOrKey }, { key: idOrKey }], deletedAt: null },
      select: { id: true, key: true },
    });
    if (!dictionary) throw new NotFoundException("Dictionary not found");
    return dictionary;
  }

  private async findItemForMutation(dictionaryId: string, itemIdOrKey: string) {
    const item = await this.prisma.dictionaryItem.findFirst({
      where: {
        dictionaryId,
        OR: [{ id: itemIdOrKey }, { key: itemIdOrKey }],
        deletedAt: null,
      },
      select: { id: true, key: true },
    });
    if (!item) throw new NotFoundException("Dictionary item not found");
    return item;
  }
}
