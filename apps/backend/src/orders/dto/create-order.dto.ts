import { DeliveryMethod, OrderSource, PaymentMethod, PaymentType } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export class DeliveryDataDto {
  @IsString()
  recipientName!: string;

  @IsString()
  recipientPhone!: string;

  @IsString()
  city!: string;

  @IsString()
  warehouse!: string;
}

export class CreateOrderDto {
  /** Optional when request is authenticated; then ownerId = current user. */
  @IsOptional()
  @IsString()
  ownerId?: string;

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
  comment?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  discountAmount?: number;

  @IsOptional()
  @IsEnum(DeliveryMethod)
  deliveryMethod?: DeliveryMethod;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsEnum(PaymentType)
  paymentType?: PaymentType;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => DeliveryDataDto)
  deliveryData?: DeliveryDataDto | null;

  @IsOptional()
  @IsEnum(OrderSource)
  orderSource?: OrderSource;
}
