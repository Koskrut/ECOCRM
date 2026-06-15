import { Type } from "class-transformer";
import { IsInt, IsNumber, IsOptional, Max, Min } from "class-validator";

export class UpdateOrderItemDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  qty?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  discountPercent?: number;
}
