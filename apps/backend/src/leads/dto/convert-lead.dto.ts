import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export type ContactMode = "link" | "create";

export class ConvertLeadContactDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  companyName?: string;
}

export class ConvertLeadDealDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount?: number;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class ConvertLeadDto {
  @IsEnum(["link", "create"], {
    message: "contactMode must be 'link' or 'create'",
  })
  contactMode!: ContactMode;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConvertLeadContactDto)
  contact?: ConvertLeadContactDto;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  createDeal?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConvertLeadDealDto)
  deal?: ConvertLeadDealDto;
}

