import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from "class-validator";

export class StoreAttributionDto {
  @IsOptional()
  @IsString()
  formType?: string;

  @IsOptional()
  @IsString()
  pageUrl?: string;

  @IsOptional()
  @IsString()
  referrer?: string;

  @IsOptional()
  @IsString()
  utmSource?: string;

  @IsOptional()
  @IsString()
  utmMedium?: string;

  @IsOptional()
  @IsString()
  utmCampaign?: string;

  @IsOptional()
  @IsString()
  utmContent?: string;

  @IsOptional()
  @IsString()
  utmTerm?: string;

  @IsOptional()
  @IsString()
  gclid?: string;

  @IsOptional()
  @IsString()
  fbclid?: string;

  @IsOptional()
  firstTouch?: unknown;

  @IsOptional()
  latestTouch?: unknown;
}

export class CreateStoreLeadDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsString()
  @MaxLength(100)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  roleSegment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string;

  @IsString()
  @MaxLength(60)
  formType!: "short_lead" | "compatibility_request" | "consultation_request";

  @IsBoolean()
  consent!: boolean;

  @IsOptional()
  @IsObject()
  attribution?: StoreAttributionDto;
}
