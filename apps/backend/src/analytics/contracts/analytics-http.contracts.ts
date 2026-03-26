/**
 * Canonical HTTP/JSON shapes for analytics endpoints.
 *
 * **Period:** services use `ResolvedPeriod` with `Date` internally; Nest serializes response bodies
 * with `Date` → ISO 8601 strings. Clients MUST treat `period.from` / `period.to` as ISO strings
 * at the wire boundary (same instant semantics as backend date math).
 *
 * **Compare:** only period-based KPI blocks belong in `compare`. Operational snapshots and chart
 * payloads must not appear in `compare` (avoid implying time-shifted backlog semantics).
 */

import type { FinanceComparePayload, FinancePayload } from "../services/analytics-finance.service";
import type { LeadsPayload } from "../services/analytics-leads.service";
import type { OverviewPayload } from "../services/analytics-overview.service";
import type { SalesComparePayload, SalesPayload } from "../services/analytics-sales.service";

/** Wire shape after JSON serialization (Date → string). */
export type AnalyticsPeriodJson = { from: string; to: string };

/** `GET /analytics/overview` — `compare` is KPI-only (no charts, no attention snapshot). */
export type OverviewAnalyticsResponseJson = {
  period: AnalyticsPeriodJson;
  data: OverviewPayload;
  compare?: { kpi: OverviewPayload["kpi"] };
};

/** `GET /analytics/sales` — `compare` is prior-period money/order KPIs only (no overdue snapshot). */
export type SalesAnalyticsResponseJson = {
  period: AnalyticsPeriodJson;
  data: SalesPayload;
  compare?: SalesComparePayload;
};

/** `GET /analytics/leads` — `compare` omits `attention` (snapshot is not period-shifted). */
export type LeadsAnalyticsResponseJson = {
  period: AnalyticsPeriodJson;
  data: LeadsPayload;
  compare?: Omit<LeadsPayload, "attention">;
};

/** `GET /analytics/finance` — `compare` is period collection KPIs only (no debt snapshot). */
export type FinanceAnalyticsResponseJson = {
  period: AnalyticsPeriodJson;
  data: FinancePayload;
  compare?: FinanceComparePayload;
};
