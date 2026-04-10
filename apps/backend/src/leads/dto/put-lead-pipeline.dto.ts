import { LeadStatus } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

/** Full snapshot row — uiStepKey is derived server-side from status, never accepted from client. */
export class PutLeadPipelineStageDto {
  @IsEnum(LeadStatus)
  status!: LeadStatus;

  @IsInt()
  @Min(0)
  @Max(5)
  sortOrder!: number;

  @IsString()
  @MaxLength(200)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  color?: string | null;

  @IsBoolean()
  visible!: boolean;

  @IsArray()
  @IsEnum(LeadStatus, { each: true })
  allowedNext!: LeadStatus[];
}

export class PutLeadPipelineDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PutLeadPipelineStageDto)
  stages!: PutLeadPipelineStageDto[];
}
