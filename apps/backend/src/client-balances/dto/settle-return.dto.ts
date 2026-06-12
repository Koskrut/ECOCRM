import { ReturnSettlementType } from "@prisma/client";
import { IsEnum, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class SettleReturnDto {
  @IsEnum(ReturnSettlementType)
  type!: ReturnSettlementType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  creditAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  refundAmount?: number;

  @IsOptional()
  @IsString()
  note?: string;
}
