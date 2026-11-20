import { Type } from "class-transformer";
import { IsInt, IsNumber, IsOptional, Matches, Max, Min, ValidateIf } from "class-validator";
import { ORDER_PROMO_ID_RE } from "../order-line-total.utils";

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

  /** Promotion id from settings, or NONE / empty to clear. */
  @IsOptional()
  @ValidateIf((_, value) => value != null && value !== "" && value !== "NONE")
  @Matches(ORDER_PROMO_ID_RE)
  promoType?: string | null;
}
