import { ManualCallOutcome } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class ListCallsHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsEnum(ManualCallOutcome)
  outcome?: ManualCallOutcome;

  /** Початок інтервалу (ISO): фільтр по часу дзвінка / завершення прозвону */
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsIn(["yes", "no", "any"])
  recording?: "yes" | "no" | "any";

  /** INBOUND | OUTBOUND | UNKNOWN — з таблиці Call; прозвін без Call не показується при INBOUND/UNKNOWN */
  @IsOptional()
  @IsIn(["INBOUND", "OUTBOUND", "UNKNOWN"])
  direction?: "INBOUND" | "OUTBOUND" | "UNKNOWN";

  /** Лише рядки з результатом прозвону (ManualCallSession) */
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true" || value === "1")
  @IsBoolean()
  manualOnly?: boolean;

  /** Лише для ADMIN / LEAD — менеджер на лінії (Call) / виконавець прозвону (ManualCallSession) */
  @IsOptional()
  @IsString()
  userId?: string;

  /** Фільтр провайдера телефонії (наприклад RINGOSTAT); не застосовується до прозвону без Call */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
