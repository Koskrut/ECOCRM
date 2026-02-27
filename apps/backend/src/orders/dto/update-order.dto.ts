import { DeliveryMethod, PaymentMethod } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsNumber, IsObject, IsOptional, IsString, Min } from "class-validator";

export class UpdateOrderDto {
  @IsOptional()
  @IsString()
  companyId?: string | null;

  @IsOptional()
  @IsString()
  clientId?: string | null;

  @IsOptional()
  @IsString()
  contactId?: string | null;

  @IsOptional()
  @IsString()
  comment?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  discountAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  paidAmount?: number;

  @IsOptional()
  @IsEnum(DeliveryMethod)
  deliveryMethod?: DeliveryMethod | null;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod | null;

  @IsOptional()
  @IsObject()
  deliveryData?: Record<string, unknown> | null;
}
