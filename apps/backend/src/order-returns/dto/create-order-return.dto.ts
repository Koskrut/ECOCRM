import { ReplacementMode, ReturnReason } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class CreateOrderReturnItemDto {
  @IsString()
  orderItemId!: string;

  @IsInt()
  @Min(1)
  qtyReturned!: number;

  @IsOptional()
  @IsString()
  actualProductId?: string;
}

export class CreateOrderReturnDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderReturnItemDto)
  items?: CreateOrderReturnItemDto[];

  @IsOptional()
  @IsBoolean()
  itemsPending?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(4)
  ttnNumber?: string;

  @IsOptional()
  @IsEnum(ReturnReason)
  reason?: ReturnReason;

  @IsOptional()
  @IsEnum(ReplacementMode)
  replacementMode?: ReplacementMode;
}
