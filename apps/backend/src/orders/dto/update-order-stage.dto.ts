import { OrderStage } from "@prisma/client";
import { IsEnum, IsOptional, IsString } from "class-validator";

export class UpdateOrderStageDto {
  @IsEnum(OrderStage)
  toStage!: OrderStage;

  @IsOptional()
  @IsString()
  reason?: string | null;
}
