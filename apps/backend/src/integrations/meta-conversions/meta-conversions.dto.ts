import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from "class-validator";

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

  @IsOptional()
  @IsString()
  fbp?: string;

  @IsOptional()
  @IsString()
  fbc?: string;

  @IsOptional()
  @IsString()
  fbclid?: string;
}

export class StoreMetaContentDto {
  @IsString()
  @MaxLength(128)
  id!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsNumber()
  itemPrice?: number;
}

export class StoreMetaInitiateCheckoutDto {
  @IsString()
  @MaxLength(80)
  eventId!: string;

  @IsNumber()
  @Min(0)
  value!: number;

  @IsString()
  @MaxLength(8)
  currency!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contentIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StoreMetaContentDto)
  contents?: StoreMetaContentDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  numItems?: number;

  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @IsString()
  fbp?: string;

  @IsOptional()
  @IsString()
  fbc?: string;

  @IsOptional()
  @IsString()
  fbclid?: string;

  @IsOptional()
  @IsString()
  eventSourceUrl?: string;
}
