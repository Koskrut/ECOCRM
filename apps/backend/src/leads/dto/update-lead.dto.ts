import { LeadChannel, LeadSource } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { LeadItemDto } from "./lead-item.dto";

export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  name?: string | null;

  @IsOptional()
  @IsString()
  firstName?: string | null;

  @IsOptional()
  @IsString()
  lastName?: string | null;

  @IsOptional()
  @IsString()
  middleName?: string | null;

  @IsOptional()
  @IsString()
  fullName?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsString()
  email?: string | null;

  @IsOptional()
  @IsString()
  companyName?: string | null;

  @IsOptional()
  @IsString()
  region?: string | null;

  @IsOptional()
  @IsString()
  city?: string | null;

  @IsOptional()
  @IsString()
  npCityRef?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsNumber()
  lat?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsNumber()
  lng?: number | null;

  @IsOptional()
  @IsString()
  googlePlaceId?: string | null;

  @IsOptional()
  @IsString()
  message?: string | null;

  @IsOptional()
  @IsString()
  comment?: string | null;

  @IsOptional()
  @IsEnum(LeadChannel)
  channel?: LeadChannel | null;

  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource | null;

  @IsOptional()
  @IsString()
  ownerId?: string | null;

  @IsOptional()
  sourceMeta?: unknown;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeadItemDto)
  items?: LeadItemDto[];
}

