import { LeadSource } from "@prisma/client";
import { IsEnum, IsOptional, IsString } from "class-validator";

export class CreateLeadDto {
  @IsString()
  companyId!: string;

  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  message?: string;

  // JSON, может быть чем угодно
  @IsOptional()
  sourceMeta?: unknown;
}

