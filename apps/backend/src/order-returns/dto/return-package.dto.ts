import { ReturnItemDisposition, ReturnPackageStatus } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { CreateOrderReturnItemDto } from "./create-order-return.dto";

export class CreateReturnPackageDto {
  @IsString()
  @MinLength(4)
  ttnNumber!: string;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsBoolean()
  itemsPending?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderReturnItemDto)
  items?: CreateOrderReturnItemDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  returnIds?: string[];

  @IsOptional()
  @IsString()
  warehouseId?: string;
}

export class UpdateReturnPackageTtnDto {
  @IsString()
  @MinLength(4)
  ttnNumber!: string;
}

export class AddReturnPackageItemsDto {
  @IsString()
  orderId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderReturnItemDto)
  items!: CreateOrderReturnItemDto[];
}

export class UpdateReturnPackageItemDispositionDto {
  @IsString()
  returnItemId!: string;

  @IsOptional()
  @IsString()
  actualProductId?: string;

  @IsEnum(ReturnItemDisposition)
  disposition!: ReturnItemDisposition;
}

export class UpdateReturnPackageDispositionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateReturnPackageItemDispositionDto)
  items!: UpdateReturnPackageItemDispositionDto[];
}

export class ReceiveReturnPackageDto {
  @IsOptional()
  @IsString()
  warehouseId?: string;
}

export class ListWarehouseQueueQueryDto {
  @IsOptional()
  @IsString()
  warehouseIds?: string;
}

export class ListReturnPackagesQueryDto {
  @IsOptional()
  @IsString()
  ttn?: string;

  @IsOptional()
  @IsString()
  contactId?: string;

  /** Packages registered by TTN that are not linked to an order return yet. */
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  unlinked?: boolean;

  @IsOptional()
  @IsEnum(ReturnPackageStatus)
  status?: ReturnPackageStatus;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

/** Suggest returnable order lines for a package by product SKU/name or productId. */
export class SuggestReturnPackageLinesQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
