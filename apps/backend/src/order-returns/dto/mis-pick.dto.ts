import { ReturnItemDisposition } from "@prisma/client";
import { Type } from "class-transformer";
import { IsArray, IsEnum, IsOptional, IsString, MinLength, ValidateNested } from "class-validator";

export class UpdateReturnItemDispositionDto {
  @IsString()
  returnItemId!: string;

  @IsOptional()
  @IsString()
  actualProductId?: string;

  @IsEnum(ReturnItemDisposition)
  disposition!: ReturnItemDisposition;
}

export class UpdateReturnItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateReturnItemDispositionDto)
  items!: UpdateReturnItemDispositionDto[];
}

export class WaiveMisPickChecklistDto {
  @IsString()
  leg!: "inbound" | "outbound";

  @IsString()
  @MinLength(3)
  reason!: string;
}
