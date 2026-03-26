import { ManualCallOutcome } from "@prisma/client";
import { IsEnum, IsISO8601, IsOptional, IsString, MinLength, ValidateIf } from "class-validator";

export class CompleteSessionDto {
  @IsEnum(ManualCallOutcome)
  outcome!: ManualCallOutcome;

  @IsOptional()
  @IsString()
  note?: string;

  @ValidateIf(
    (o) =>
      o.outcome === ManualCallOutcome.REQUESTED_CALLBACK ||
      o.outcome === ManualCallOutcome.MEETING_SCHEDULED,
  )
  @IsISO8601()
  callbackAt?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  idempotencyKey?: string;
}
