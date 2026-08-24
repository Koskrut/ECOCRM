import { Type } from "class-transformer";
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import {
  ORDER_PROMO_BUY_100_GET_30,
  ORDER_PROMO_QTY_25_MINUS_2,
} from "../order-line-total.utils";

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

  /** BUY_100_GET_30 | QTY_25_MINUS_2 | null/NONE to clear */
  @IsOptional()
  @IsIn([ORDER_PROMO_BUY_100_GET_30, ORDER_PROMO_QTY_25_MINUS_2, "NONE", ""])
  promoType?: string | null;
}
