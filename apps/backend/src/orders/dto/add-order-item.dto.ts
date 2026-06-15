import { Type } from "class-transformer";
import { IsInt, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

export class AddOrderItemDto {
  @IsString()
  productId!: string;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  qty!: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  discountPercent?: number;
}
