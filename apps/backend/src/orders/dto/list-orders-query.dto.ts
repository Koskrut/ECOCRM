import {
  OrderFinancialStatus,
  OrderPaymentStatus,
  OrderStage,
  OrderStatus,
  PaymentType,
} from "@prisma/client";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

const ORDER_SORT_FIELDS = [
  "createdAt",
  "totalAmount",
  "status",
  "orderNumber",
  "orderStage",
  "financialStatus",
  "paymentDueDate",
] as const;
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
  @IsEnum(OrderStage)
  orderStage?: OrderStage;

  /** Comma-separated OrderStage values (e.g. AWAITING_STOCK,CONFIRMED). */
  @IsOptional()
  @IsString()
  orderStages?: string;

  @IsOptional()
  @IsString()
  /** Only orders split from this parent (child orders). */
  parentOrderId?: string;

  @IsOptional()
  @IsEnum(OrderFinancialStatus)
  financialStatus?: OrderFinancialStatus;

  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  financialBoard?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  overdue?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  dueSoon?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  hasDebt?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  hasDueDate?: boolean;

  @IsOptional()
  @IsString()
  ownerId?: string;

  /** Comma-separated warehouse ids (e.g. seed-wh-dnipro,seed-wh-odesa). */
  @IsOptional()
  @IsString()
  warehouseIds?: string;

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
