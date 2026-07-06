import { LeadChannel, LeadSource, LeadStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { LEAD_ATTENTION_PRESETS } from "../leads-attention.util";

export class ListLeadsQueryDto {
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
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @IsOptional()
  @IsEnum(LeadChannel)
  channel?: LeadChannel;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  sortBy?: "createdAt" | "score";

  @IsOptional()
  @IsString()
  sortOrder?: "asc" | "desc";

  /** Inbox / analytics attention preset — list matches dashboard tile counts. */
  @IsOptional()
  @IsIn([...LEAD_ATTENTION_PRESETS])
  attention?: (typeof LEAD_ATTENTION_PRESETS)[number];

  @IsOptional()
  @IsIn(["week", "month"])
  attentionPeriod?: "week" | "month";

  /** Comma-separated lead ids (e.g. from daily agenda plan). */
  @IsOptional()
  @IsString()
  ids?: string;
}

