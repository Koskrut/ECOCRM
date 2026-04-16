import { Transform, Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export const CONTACT_WORK_QUEUE_PRESETS = [
  "attention",
  "overdue",
  "new-no-first-contact",
  "debt-control",
  "return-to-work",
  "risk-or-dormant",
] as const;

export type ContactWorkQueuePreset = (typeof CONTACT_WORK_QUEUE_PRESETS)[number];

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
