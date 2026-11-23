import { ReturnReason } from "@prisma/client";
import { Type } from "class-transformer";
import { IsArray, IsEnum, IsOptional, IsString, ValidateNested } from "class-validator";
import { CreateOrderReturnItemDto } from "./create-order-return.dto";

export class UpdateOrderReturnDto {
  @IsOptional()
  @IsEnum(ReturnReason)
  reason?: ReturnReason;

  /** Empty string keeps the order warehouse. Omit the field to leave it unchanged. */
  @IsOptional()
  @IsString()
  warehouseId?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderReturnItemDto)
  items?: CreateOrderReturnItemDto[];
}
