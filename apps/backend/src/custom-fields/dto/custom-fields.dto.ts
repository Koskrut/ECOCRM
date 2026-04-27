import { BadRequestException } from "@nestjs/common";
import { CustomFieldEntityType, CustomFieldType, Prisma } from "@prisma/client";

const KEY_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;

export type CustomFieldDefinitionListQuery = {
  entityType?: CustomFieldEntityType;
  includeDeleted?: boolean;
  includeInactive?: boolean;
};

export type UpsertCustomFieldDefinitionDto = {
  entityType?: CustomFieldEntityType | string;
  key?: string;
  label?: string;
  description?: string | null;
  type?: CustomFieldType | string;
  required?: boolean;
  isActive?: boolean;
  system?: boolean;
  dictionaryId?: string | null;
  settings?: Prisma.InputJsonValue | null;
};

export type UpsertCustomFieldOptionDto = {
  key?: string;
  label?: string;
  value?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  metadata?: Prisma.InputJsonValue | null;
};

export type UpsertCustomFieldValueDto = {
  value?: unknown;
};

export type NormalizedCustomFieldValue = {
  valueString: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueDate: Date | null;
  valueJson: Prisma.InputJsonValue | typeof Prisma.JsonNull | null;
  dictionaryItemId: string | null;
};

export function normalizeCustomFieldKey(value: unknown, field = "key"): string {
  const key = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!key) throw new BadRequestException(`${field} is required`);
  if (key.length > 120) throw new BadRequestException(`${field} is too long`);
  if (!KEY_RE.test(key)) {
    throw new BadRequestException(`${field} must use lowercase letters, numbers, underscores, and dots`);
  }
  return key;
}

export function parseCustomFieldEntityType(value: unknown): CustomFieldEntityType {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!Object.values(CustomFieldEntityType).includes(normalized as CustomFieldEntityType)) {
    throw new BadRequestException("entityType is invalid");
  }
  return normalized as CustomFieldEntityType;
}

export function parseCustomFieldType(value: unknown): CustomFieldType {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!Object.values(CustomFieldType).includes(normalized as CustomFieldType)) {
    throw new BadRequestException("type is invalid");
  }
  return normalized as CustomFieldType;
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

export function optionalInteger(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n)) throw new BadRequestException("sortOrder must be an integer");
  return n;
}

export function normalizeCustomFieldValue(type: CustomFieldType, value: unknown): NormalizedCustomFieldValue {
  const empty: NormalizedCustomFieldValue = {
    valueString: null,
    valueNumber: null,
    valueBoolean: null,
    valueDate: null,
    valueJson: null,
    dictionaryItemId: null,
  };

  if (value === undefined || value === null || value === "") return empty;

  switch (type) {
    case CustomFieldType.TEXT:
    case CustomFieldType.SELECT:
    case CustomFieldType.USER:
      return { ...empty, valueString: String(value) };
    case CustomFieldType.NUMBER:
    case CustomFieldType.MONEY: {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) throw new BadRequestException("value must be a number");
      return { ...empty, valueNumber: n };
    }
    case CustomFieldType.BOOLEAN:
      if (typeof value !== "boolean") throw new BadRequestException("value must be a boolean");
      return { ...empty, valueBoolean: value };
    case CustomFieldType.DATE: {
      const date = value instanceof Date ? value : new Date(String(value));
      if (Number.isNaN(date.getTime())) throw new BadRequestException("value must be a valid date");
      return { ...empty, valueDate: date };
    }
    case CustomFieldType.MULTISELECT:
      if (!Array.isArray(value)) throw new BadRequestException("value must be an array");
      return { ...empty, valueJson: value.filter((v): v is string => typeof v === "string") };
    case CustomFieldType.DICTIONARY_ITEM:
      return { ...empty, dictionaryItemId: String(value) };
    case CustomFieldType.JSON:
      return { ...empty, valueJson: value as Prisma.InputJsonValue };
    default:
      return empty;
  }
}
