import { ReturnStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsOptional, ValidateNested } from "class-validator";
import { SettleReturnDto } from "../../client-balances/dto/settle-return.dto";

export class UpdateReturnStatusDto {
  @IsEnum(ReturnStatus)
  status!: ReturnStatus;

  @IsOptional()
  @ValidateNested()
  @Type(() => SettleReturnDto)
  settlement?: SettleReturnDto;
}
