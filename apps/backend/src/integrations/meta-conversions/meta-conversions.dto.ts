import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateMetaConversionsDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  pixelId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  accessToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  testEventCode?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class StoreMetaViewContentDto {
  @IsString()
  @MaxLength(128)
  eventId!: string;

  @IsString()
  @MaxLength(500)
  path!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  search?: string;
}
