"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toAnalyticsSearchParams } from "./analytics.types";

function defaultRange() {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  from.setHours(0, 0, 0, 0);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  };
}

export function useAnalyticsFilters() {
  const init = useMemo(() => defaultRange(), []);
  const [dateFrom, setDateFrom] = useState(init.dateFrom);
  const [dateTo, setDateTo] = useState(init.dateTo);
  const [compare, setCompare] = useState(false);
  const [managerId, setManagerId] = useState("");

  const querySuffix = useMemo(() => {
    return toAnalyticsSearchParams({
      dateFrom,
      dateTo,
      period: "custom",
      compare: compare ? "prev_period" : undefined,
      managerId: managerId || undefined,
    });
  }, [dateFrom, dateTo, compare, managerId]);

  const onFiltersChange = useCallback(
    (next: { dateFrom: string; dateTo: string; compare: boolean }) => {
      setDateFrom(next.dateFrom);
      setDateTo(next.dateTo);
      setCompare(next.compare);
    },
    [],
  );

  useEffect(() => {
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "18e84e" },
      body: JSON.stringify({
        sessionId: "18e84e",
        runId: "run-manager-scope-1",
        hypothesisId: "H21",
        location: "useAnalyticsFilters.ts:querySuffix",
        message: "Analytics filters state changed",
        data: { dateFrom, dateTo, compare, managerId: managerId || null, querySuffix },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [dateFrom, dateTo, compare, managerId, querySuffix]);

  return {
    dateFrom,
    dateTo,
    compare,
    managerId,
    setManagerId,
    querySuffix,
    onFiltersChange,
  };
}

export function formatMoneyUa(n: number): string {
  return (
    new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(
      n,
    ) + " ₴"
  );
}

export function formatMoneyUsd(n: number): string {
  return (
    new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(
      n,
    ) + " $"
  );
}

export function deltaPct(current: number, prev: number): number | null {
  if (prev === 0) return current === 0 ? 0 : null;
  return ((current - prev) / prev) * 100;
}
