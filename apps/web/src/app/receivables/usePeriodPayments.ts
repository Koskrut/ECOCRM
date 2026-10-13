"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";
import { CRM_TIME_ZONE, kyivStartOfDayFromYmd } from "@/lib/crmDatetime";
import { receivablesApi, type PeriodPaymentRow } from "@/lib/api/resources/receivables";

export const PERIOD_PAYMENTS_PAGE_SIZE = 50;

export type UsePeriodPaymentsParams = {
  enabled: boolean;
  /** Kyiv calendar dates (YYYY-MM-DD). */
  paidFrom: string;
  paidTo: string;
  ownerId: string;
};

export function usePeriodPayments({ enabled, paidFrom, paidTo, ownerId }: UsePeriodPaymentsParams) {
  const [items, setItems] = useState<PeriodPaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [currency, setCurrency] = useState("USD");
  const [loadingMore, setLoadingMore] = useState(false);
  const requestRef = useRef(0);

  const dateParams = useCallback(() => {
    return {
      paidFrom: paidFrom ? kyivStartOfDayFromYmd(paidFrom).toISOString() : undefined,
      paidTo: paidTo
        ? (DateTime.fromISO(paidTo, { zone: CRM_TIME_ZONE }).endOf("day").toUTC().toISO() ??
          undefined)
        : undefined,
      ownerId: ownerId || undefined,
    };
  }, [paidFrom, paidTo, ownerId]);

  const reload = useCallback(async () => {
    const requestId = ++requestRef.current;
    try {
      const res = await receivablesApi.periodPayments({
        ...dateParams(),
        page: 1,
        pageSize: PERIOD_PAYMENTS_PAGE_SIZE,
      });
      if (requestId !== requestRef.current) return;
      setItems(res.data.items ?? []);
      setTotal(res.data.total ?? 0);
      setPage(1);
      setCurrency(res.data.currency ?? "USD");
    } catch {
      if (requestId === requestRef.current) {
        setItems([]);
        setTotal(0);
      }
    }
  }, [dateParams]);

  const loadMore = useCallback(async () => {
    if (loadingMore || items.length >= total) return;
    const nextPage = page + 1;
    const requestId = ++requestRef.current;
    setLoadingMore(true);
    try {
      const res = await receivablesApi.periodPayments({
        ...dateParams(),
        page: nextPage,
        pageSize: PERIOD_PAYMENTS_PAGE_SIZE,
      });
      if (requestId !== requestRef.current) return;
      setItems((prev) => [...prev, ...(res.data.items ?? [])]);
      setTotal(res.data.total ?? total);
      setPage(nextPage);
    } catch {
      // keep existing items
    } finally {
      if (requestId === requestRef.current) setLoadingMore(false);
    }
  }, [loadingMore, items.length, total, page, dateParams]);

  useEffect(() => {
    if (!enabled) return;
    void reload();
    return () => {
      requestRef.current += 1;
    };
  }, [enabled, reload]);

  /** Sum of amountUsd for loaded rows (base currency proxy when backend has no total). */
  const loadedTotalBase = useMemo(
    () => items.reduce((sum, p) => sum + (p.amountUsd != null ? Number(p.amountUsd) : 0), 0),
    [items],
  );

  return {
    items,
    total,
    page,
    pageSize: PERIOD_PAYMENTS_PAGE_SIZE,
    currency,
    loadedTotalBase,
    loadingMore,
    hasMore: items.length < total,
    loadMore,
    reload,
  };
}
