import { OrderStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString } from "class-validator";

export class UpdateOrderStatusDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  toStatus?: OrderStatus;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}
