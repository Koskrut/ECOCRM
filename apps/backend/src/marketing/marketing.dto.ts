import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class MarketingQueryDto {
  @IsOptional()
  @IsIn(["ALL", "META", "GOOGLE", "TIKTOK"])
  platform?: "ALL" | "META" | "GOOGLE" | "TIKTOK";

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsInt()
  windowDays?: number;
}

export class UpsertMarketingAccountDto {
  @IsIn(["META", "GOOGLE", "TIKTOK"])
  platform!: "META" | "GOOGLE" | "TIKTOK";

  @IsString()
  @MaxLength(64)
  externalAccountId!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(8)
  currency!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  accessKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  pixelId?: string;

  @IsOptional()
  @IsIn(["api", "file"])
  spendSource?: "api" | "file";

  @IsOptional()
  @IsString()
  @MaxLength(400)
  developerToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  loginCustomerId?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  clientSecret?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  qualityConversionActionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  junkConversionActionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  purchaseConversionActionId?: string;
}

export class MarketingFlagsDto {
  @IsOptional()
  @IsBoolean()
  lostAsJunk?: boolean;

  @IsOptional()
  @IsInt()
  paymentWindowDays?: number;
}

export class SpendFileDto {
  @IsString()
  csv!: string;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class SyncAudienceDto {
  @IsOptional()
  @IsBoolean()
  confirmRights?: boolean;

  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @IsOptional()
  @Min(0)
  threshold?: number;

  @IsOptional()
  @IsInt()
  dormantDays?: number;
}

export class CreateMarketingLinkDto {
  @IsIn(["FACEBOOK", "INSTAGRAM", "GOOGLE", "TIKTOK", "OTHER"])
  channel!: "FACEBOOK" | "INSTAGRAM" | "GOOGLE" | "TIKTOK" | "OTHER";

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  campaignExternalId?: string;
}

export class AiCallsDto {
  @IsString()
  outboundCampaignId!: string;

  @IsOptional()
  @IsIn(["META", "GOOGLE", "TIKTOK"])
  platform?: "META" | "GOOGLE" | "TIKTOK";

  @IsOptional()
  @IsString()
  campaignExternalId?: string;
}
