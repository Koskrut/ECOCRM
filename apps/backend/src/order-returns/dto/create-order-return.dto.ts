import { Type } from "class-transformer";
import { IsArray, IsInt, IsString, Min, ValidateNested } from "class-validator";

export class CreateOrderReturnItemDto {
  @IsString()
  orderItemId!: string;

  @IsInt()
  @Min(1)
  qtyReturned!: number;
}

export class CreateOrderReturnDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderReturnItemDto)
  items!: CreateOrderReturnItemDto[];
}
