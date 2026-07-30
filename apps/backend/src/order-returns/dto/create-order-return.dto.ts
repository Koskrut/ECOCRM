import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
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
}
