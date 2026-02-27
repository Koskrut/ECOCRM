import { Type } from "class-transformer";
import { IsNumber, IsString, Min } from "class-validator";

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
}
