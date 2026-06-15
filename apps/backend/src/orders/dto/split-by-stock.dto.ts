import { Type } from "class-transformer";
import { IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class SplitByStockPickDto {
  @IsString()
  itemId!: string;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  foundQty!: number;
}

export class SplitByStockDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SplitByStockPickDto)
  picks?: SplitByStockPickDto[];
}
