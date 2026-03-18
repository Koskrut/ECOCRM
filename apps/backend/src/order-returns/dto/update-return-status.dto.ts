import { ReturnStatus } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UpdateReturnStatusDto {
  @IsEnum(ReturnStatus)
  status!: ReturnStatus;
}
