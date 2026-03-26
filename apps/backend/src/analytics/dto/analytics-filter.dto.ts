export class AnalyticsFilterDto {
  dateFrom?: string;
  dateTo?: string;
  period?: "week" | "month" | "quarter" | "year" | "custom";
  managerId?: string;
  compare?: "prev_period";
  /** Canonical region name (e.g. drilldown type orders_region). */
  region?: string;
}

