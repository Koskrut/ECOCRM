/**
 * Canonical HTTP/JSON shapes for analytics endpoints.
 *
 * **Period:** services use `ResolvedPeriod` with `Date` internally; Nest serializes response bodies
 * with `Date` → ISO 8601 strings. Clients MUST treat `period.from` / `period.to` as ISO strings
 * at the wire boundary (same instant semantics as backend date math).
 *
 * **Compare:** prior-window KPIs use the same period semantics as the primary window. Chart-only payloads
 * may still be omitted from `compare` where the UI does not show deltas.
 */

import type { FinanceComparePayload, FinancePayload } from "../services/analytics-finance.service";
import type { LeadsPayload } from "../services/analytics-leads.service";
import type { OverviewPayload } from "../services/analytics-overview.service";
import type { SalesComparePayload, SalesPayload } from "../services/analytics-sales.service";

/** Wire shape after JSON serialization (Date → string). */
export type AnalyticsPeriodJson = { from: string; to: string };

/** `GET /analytics/overview` — `compare` is KPI-only (no charts, no attention block). */
export type OverviewAnalyticsResponseJson = {
  period: AnalyticsPeriodJson;
  data: OverviewPayload;
  compare?: { kpi: OverviewPayload["kpi"] };
};

/** `GET /analytics/sales` — `compare` is prior-period KPIs incl. overdue tasks count; no byStage. */
export type SalesAnalyticsResponseJson = {
  period: AnalyticsPeriodJson;
  data: SalesPayload;
  compare?: SalesComparePayload;
};

/** `GET /analytics/leads` — `compare` is the full prior-period payload (incl. attention). */
export type LeadsAnalyticsResponseJson = {
  period: AnalyticsPeriodJson;
  data: LeadsPayload;
  compare?: LeadsPayload;
};

/** `GET /analytics/finance` — `compare` is period collection KPIs only (debt KPIs are in `data` only). */
export type FinanceAnalyticsResponseJson = {
  period: AnalyticsPeriodJson;
  data: FinancePayload;
  compare?: FinanceComparePayload;
};
