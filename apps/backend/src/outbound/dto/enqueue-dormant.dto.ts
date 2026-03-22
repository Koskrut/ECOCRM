import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class EnqueueDormantDto {
  /** If omitted, loads from campaign.config.dormantDaysMin (default 90). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  dormantDaysMin?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  limit?: number;

  /** Explicit contact ids instead of auto-discovery. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  contactIds?: string[];
}
