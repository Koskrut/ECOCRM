import { Transform, Type } from "class-transformer";
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import type { ContactPriorityReasonCode } from "../types/contacts-priority.types";

export const CONTACT_WORK_QUEUE_PRESETS = [
  "attention",
  "overdue",
  "new-no-first-contact",
  "debt-control",
  "return-to-work",
  "risk-or-dormant",
] as const;

export type ContactWorkQueuePreset = (typeof CONTACT_WORK_QUEUE_PRESETS)[number];

export const CONTACT_PRIORITY_REASON_CODES = [
  "OVERDUE_FOLLOWUP",
  "NEW_LEAD_NO_FIRST_CONTACT",
  "NO_CONTACT_14_DAYS",
  "NO_ORDER_30_DAYS",
  "HAS_DEBT",
  "HIGH_VALUE_CLIENT",
  "RETURN_TO_WORK",
  "AT_RISK",
  "DORMANT",
] as const satisfies readonly ContactPriorityReasonCode[];

function normalizeReasonQuery(value: unknown): ContactPriorityReasonCode[] | undefined {
  const raw = Array.isArray(value) ? value : value != null && value !== "" ? [value] : [];
  const parts = raw
    .flatMap((v) => String(v).split(","))
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return undefined;
  return parts as ContactPriorityReasonCode[];
}

export class GetWorkQueueDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  pageSize?: number;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsIn(CONTACT_WORK_QUEUE_PRESETS)
  preset?: ContactWorkQueuePreset;

  /** Repeated query `reason=` (OR). Also accepts comma-separated. */
  @IsOptional()
  @Transform(({ value }) => normalizeReasonQuery(value))
  @IsArray()
  @IsIn(CONTACT_PRIORITY_REASON_CODES, { each: true })
  reason?: ContactPriorityReasonCode[];

  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  onlyOverdue?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  onlyDebt?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  onlyNoContact?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  includeExcluded?: boolean;

  @IsOptional()
  @IsString()
  q?: string;
}
