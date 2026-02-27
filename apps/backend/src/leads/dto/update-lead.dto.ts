import { Type } from "class-transformer";
import {
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { LeadItemDto } from "./lead-item.dto";

export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  name?: string | null;

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
  message?: string | null;

  @IsOptional()
  sourceMeta?: unknown;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeadItemDto)
  items?: LeadItemDto[];
}

