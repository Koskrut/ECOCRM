export type AnalyticsPeriodQuery = {
  dateFrom?: string;
  dateTo?: string;
  period?: "week" | "month" | "quarter" | "year" | "custom";
  compare?: "prev_period";
  managerId?: string;
};

/** Mirrors backend `AnalyticsDrilldownService` drill types. */
export type AnalyticsDrilldownType =
  | "orders_period"
  | "payments_period"
  | "leads_period"
  | "overdue_orders"
  | "overdue_tasks";

export const ANALYTICS_DRILLDOWN_TITLES: Record<AnalyticsDrilldownType, string> = {
  orders_period: "Замовлення за період",
  payments_period: "Оплати за період",
  leads_period: "Ліди за період",
  overdue_orders: "Прострочені замовлення",
  overdue_tasks: "Прострочені задачі",
};

/** Merge filter query string (`?dateFrom=…`) with drilldown params. */
export function buildDrilldownQuery(
  filterQuerySuffix: string,
  type: AnalyticsDrilldownType,
  page: number,
  pageSize: number,
): string {
  const raw = filterQuerySuffix.replace(/^\?/, "");
  const p = new URLSearchParams(raw);
  p.set("type", type);
  p.set("page", String(page));
  p.set("pageSize", String(pageSize));
  return `?${p.toString()}`;
}

export function toAnalyticsSearchParams(q: AnalyticsPeriodQuery): string {
  const p = new URLSearchParams();
  if (q.dateFrom) p.set("dateFrom", q.dateFrom);
  if (q.dateTo) p.set("dateTo", q.dateTo);
  if (q.period) p.set("period", q.period);
  if (q.compare) p.set("compare", q.compare);
  if (q.managerId) p.set("managerId", q.managerId);
  const s = p.toString();
  return s ? `?${s}` : "";
}
