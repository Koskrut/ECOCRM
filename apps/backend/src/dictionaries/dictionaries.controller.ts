import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { DictionariesService } from "./dictionaries.service";
import type { DictionaryListQuery, UpsertDictionaryDto, UpsertDictionaryItemDto } from "./dto/dictionaries.dto";

function parseBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return undefined;
}

@Controller("dictionaries")
@Roles(UserRole.ADMIN)
export class DictionariesController {
  constructor(private readonly dictionaries: DictionariesService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    const parsed: DictionaryListQuery = {
      includeDeleted: parseBoolean(query.includeDeleted),
      includeInactive: parseBoolean(query.includeInactive),
      system: parseBoolean(query.system),
      q: typeof query.q === "string" ? query.q : undefined,
    };
    return this.dictionaries.list(parsed);
  }

  @Post()
  create(@Body() body: UpsertDictionaryDto) {
    return this.dictionaries.create(body);
  }

  @Get(":idOrKey")
  get(@Param("idOrKey") idOrKey: string, @Query("includeDeleted") includeDeleted?: string) {
    return this.dictionaries.get(idOrKey, { includeDeleted: parseBoolean(includeDeleted) });
  }

  @Patch(":idOrKey")
  update(@Param("idOrKey") idOrKey: string, @Body() body: UpsertDictionaryDto) {
    return this.dictionaries.update(idOrKey, body);
  }

  @Delete(":idOrKey")
  remove(@Param("idOrKey") idOrKey: string) {
    return this.dictionaries.softDelete(idOrKey);
  }

  @Post(":idOrKey/items")
  createItem(@Param("idOrKey") idOrKey: string, @Body() body: UpsertDictionaryItemDto) {
    return this.dictionaries.createItem(idOrKey, body);
  }

  @Patch(":idOrKey/items/:itemIdOrKey")
  updateItem(
    @Param("idOrKey") idOrKey: string,
    @Param("itemIdOrKey") itemIdOrKey: string,
    @Body() body: UpsertDictionaryItemDto,
  ) {
    return this.dictionaries.updateItem(idOrKey, itemIdOrKey, body);
  }

  @Delete(":idOrKey/items/:itemIdOrKey")
  removeItem(@Param("idOrKey") idOrKey: string, @Param("itemIdOrKey") itemIdOrKey: string) {
    return this.dictionaries.softDeleteItem(idOrKey, itemIdOrKey);
  }
}
