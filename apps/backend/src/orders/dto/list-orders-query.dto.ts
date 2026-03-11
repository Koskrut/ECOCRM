import { OrderPaymentStatus, OrderStatus, PaymentType } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

const ORDER_SORT_FIELDS = ["createdAt", "totalAmount", "status", "orderNumber"] as const;
type OrderSortField = (typeof ORDER_SORT_FIELDS)[number];

export class ListOrdersQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  pageSize?: number;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(PaymentType)
  paymentType?: PaymentType;

  @IsOptional()
  @IsEnum(OrderPaymentStatus)
  paymentStatus?: OrderPaymentStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  amountFrom?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  amountTo?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === "true" || value === true) return true;
    if (value === "false" || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  hasTtn?: boolean;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (typeof value !== "string") return undefined;
    return ORDER_SORT_FIELDS.includes(value as OrderSortField) ? value : undefined;
  })
  sortBy?: OrderSortField;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (typeof value !== "string") return undefined;
    const normalized = value.toLowerCase();
    if (normalized === "asc" || normalized === "desc") return normalized;
    return undefined;
  })
  sortDir?: "asc" | "desc";

  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  board?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  withCompanyClient?: boolean;
}
