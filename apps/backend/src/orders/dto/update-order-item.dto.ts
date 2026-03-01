import { Type } from "class-transformer";
import { IsNumber, IsOptional, Min } from "class-validator";

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
}
