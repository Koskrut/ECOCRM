import { BadRequestException } from "@nestjs/common";
import { CustomFieldEntityType, LayoutType, Prisma } from "@prisma/client";

const KEY_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;

export type LayoutListQuery = {
  entityType?: CustomFieldEntityType;
  type?: LayoutType;
  includeDeleted?: boolean;
  includeInactive?: boolean;
};

export type UpsertLayoutDto = {
  entityType?: CustomFieldEntityType | string;
  type?: LayoutType | string;
  key?: string;
  name?: string;
  description?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
  settings?: Prisma.InputJsonValue | null;
};

export type UpsertLayoutSectionDto = {
  key?: string;
  title?: string;
  description?: string | null;
  sortOrder?: number;
  columns?: number;
  isActive?: boolean;
  settings?: Prisma.InputJsonValue | null;
};

export type UpsertLayoutFieldDto = {
  key?: string;
  fieldKey?: string | null;
  customFieldDefinitionId?: string | null;
  label?: string | null;
  sortOrder?: number;
  required?: boolean;
  readonly?: boolean;
  hidden?: boolean;
  width?: number | null;
  settings?: Prisma.InputJsonValue | null;
};

export function normalizeLayoutKey(value: unknown, field = "key"): string {
  const key = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!key) throw new BadRequestException(`${field} is required`);
  if (key.length > 120) throw new BadRequestException(`${field} is too long`);
  if (!KEY_RE.test(key)) {
    throw new BadRequestException(`${field} must use lowercase letters, numbers, underscores, and dots`);
  }
  return key;
}

export function parseLayoutEntityType(value: unknown): CustomFieldEntityType {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!Object.values(CustomFieldEntityType).includes(normalized as CustomFieldEntityType)) {
    throw new BadRequestException("entityType is invalid");
  }
  return normalized as CustomFieldEntityType;
}

export function parseLayoutType(value: unknown): LayoutType {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!Object.values(LayoutType).includes(normalized as LayoutType)) {
    throw new BadRequestException("type is invalid");
  }
  return normalized as LayoutType;
}

export function optionalTrimmedString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

export function optionalNullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = String(value).trim();
  return text || null;
}

export function optionalInteger(value: unknown, field = "value"): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n)) throw new BadRequestException(`${field} must be an integer`);
  return n;
}

export function normalizeColumns(value: unknown): number | undefined {
  const columns = optionalInteger(value, "columns");
  if (columns === undefined) return undefined;
  if (columns < 1 || columns > 4) throw new BadRequestException("columns must be between 1 and 4");
  return columns;
}

export function normalizeWidth(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const width = optionalInteger(value, "width");
  if (width === undefined) return undefined;
  if (width < 1 || width > 12) throw new BadRequestException("width must be between 1 and 12");
  return width;
}
