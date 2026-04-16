import { IsIn, IsOptional, IsString } from "class-validator";

export class AnalyticsFilterDto {
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsIn(["week", "month", "quarter", "year", "custom"])
  period?: "week" | "month" | "quarter" | "year" | "custom";

  @IsOptional()
  @IsString()
  managerId?: string;

  @IsOptional()
  @IsIn(["prev_period"])
  compare?: "prev_period";

  /** Canonical region name (e.g. drilldown type orders_region). */
  @IsOptional()
  @IsString()
  region?: string;

  /** Drilldown discriminator (required only for GET /analytics/drilldown). */
  @IsOptional()
  @IsString()
  type?: string;
}

