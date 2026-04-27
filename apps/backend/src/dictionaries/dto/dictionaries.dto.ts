import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

export type DictionaryListQuery = {
  includeDeleted?: boolean;
  includeInactive?: boolean;
  system?: boolean;
  q?: string;
};

export type UpsertDictionaryDto = {
  key?: string;
  name?: string;
  description?: string | null;
  system?: boolean;
  isActive?: boolean;
};

export type UpsertDictionaryItemDto = {
  key?: string;
  label?: string;
  value?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  metadata?: Prisma.InputJsonValue | null;
};

const KEY_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;

export function normalizeDictionaryKey(value: unknown, field = "key"): string {
  const key = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!key) throw new BadRequestException(`${field} is required`);
  if (key.length > 120) throw new BadRequestException(`${field} is too long`);
  if (!KEY_RE.test(key)) {
    throw new BadRequestException(`${field} must use lowercase letters, numbers, underscores, and dots`);
  }
  return key;
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

export function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function optionalInteger(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n)) throw new BadRequestException("sortOrder must be an integer");
  return n;
}
