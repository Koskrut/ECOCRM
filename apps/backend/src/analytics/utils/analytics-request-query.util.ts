import type { Request } from "express";
import type { AnalyticsFilterDto } from "../dto/analytics-filter.dto";

function rawQueryFirst(req: Request, key: string): string | undefined {
  const v = req.query[key];
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) {
    const x = v[0];
    if (x === undefined || x === null) return undefined;
    return String(x);
  }
  return String(v);
}

const PERIOD_VALUES = new Set(["week", "month", "quarter", "year", "custom"]);

/**
 * Prefer Express `req.query` for filter strings so date range works even if the global
 * ValidationPipe / DTO pipeline drops or alters fields.
 */
export function mergeAnalyticsFilterFromRequest(req: Request, query: AnalyticsFilterDto): AnalyticsFilterDto {
  const periodRaw = rawQueryFirst(req, "period");
  const period =
    periodRaw && PERIOD_VALUES.has(periodRaw)
      ? (periodRaw as AnalyticsFilterDto["period"])
      : query.period;

  const compareRaw = rawQueryFirst(req, "compare");
  const compare = compareRaw === "prev_period" ? ("prev_period" as const) : query.compare;

  return {
    dateFrom: rawQueryFirst(req, "dateFrom") ?? query.dateFrom,
    dateTo: rawQueryFirst(req, "dateTo") ?? query.dateTo,
    period,
    managerId: rawQueryFirst(req, "managerId") ?? query.managerId,
    compare,
    region: rawQueryFirst(req, "region") ?? query.region,
    type: rawQueryFirst(req, "type") ?? query.type,
  };
}
