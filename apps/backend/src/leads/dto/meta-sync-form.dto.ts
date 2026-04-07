import { Type } from "class-transformer";
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class MetaSyncFormDto {
  /**
   * Meta Lead Ads form ID (leadgen form).
   * Example: "123456789012345"
   */
  @IsString()
  formId!: string;

  /**
   * Optional lower bound for lead created_time (ISO string).
   * Passed to Graph API as `since` (best-effort; Graph semantics may vary).
   */
  @IsOptional()
  @IsDateString()
  since?: string;

  /**
   * Optional upper bound for lead created_time (ISO string).
   * Passed to Graph API as `until` (best-effort; Graph semantics may vary).
   */
  @IsOptional()
  @IsDateString()
  until?: string;

  /**
   * Page size for Graph pagination.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  pageSize?: number;

  /**
   * Safety cap on number of pages to fetch (prevents infinite loops).
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  @Type(() => Number)
  maxPages?: number;

  /**
   * If true, does not persist leads; only counts what would be processed.
   */
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  dryRun?: boolean;
}

