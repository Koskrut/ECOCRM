import { IsDateString, IsIn, IsOptional, IsString } from "class-validator";

export type AnalyticsCompareMode = "prev_period";

export class AnalyticsFilterDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsIn(["week", "month", "quarter", "year", "custom"])
  period?: "week" | "month" | "quarter" | "year" | "custom";

  /** ADMIN (Phase 2+): filter all aggregates to this order owner */
  @IsOptional()
  @IsString()
  managerId?: string;

  @IsOptional()
  @IsIn(["prev_period"])
  compare?: AnalyticsCompareMode;
}
