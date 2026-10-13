"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/feedback";
import { strings } from "@/locales";
import {
  receivablesApi,
  type ReceivablesAgingLabel,
  type WorkClientRow,
  type WorkClientsSortKey,
  type WorkOrderRow,
} from "@/lib/api/resources/receivables";
import type { ReceivablesWorkView, SortDir } from "./receivables-url";
import type { ReceivablesWorkFilters } from "./ReceivablesWorkFilters";
import type { AgingChip } from "./aging";

export type ReceivablesWorkSummary = Awaited<ReturnType<typeof receivablesApi.workSummary>>["data"];

export type ReceivablesAgingBucket = Awaited<
  ReturnType<typeof receivablesApi.workAging>
>["data"]["buckets"][number];

export const WORK_PAGE_SIZE = 50;

export type UseReceivablesWorkParams = {
  /** Loads automatically while enabled and whenever params change. */
  enabled: boolean;
  workView: ReceivablesWorkView;
  ownerId: string;
  q: string;
  /** Orders view only. */
  clientId: string;
  filters: ReceivablesWorkFilters;
  aging: AgingChip;
  sort: WorkClientsSortKey | "";
  dir: SortDir;
  /** Called after every successful load (e.g. to reset row selection). */
  onLoaded?: () => void;
};

export function useReceivablesWork({
  enabled,
  workView,
  ownerId,
  q,
  clientId,
  filters,
  aging,
  sort,
  dir,
  onLoaded,
}: UseReceivablesWorkParams) {
  const { pushToast } = useToast();
  const loadError = strings.receivables.loadError;
  const [summary, setSummary] = useState<ReceivablesWorkSummary | null>(null);
  const [clients, setClients] = useState<WorkClientRow[]>([]);
  const [orders, setOrders] = useState<WorkOrderRow[]>([]);
  const [agingBuckets, setAgingBuckets] = useState<ReceivablesAgingBucket[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [snoozedCount, setSnoozedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestRef = useRef(0);
  const onLoadedRef = useRef(onLoaded);

  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);

  const { overdue, needsComment, promisedToday, promiseBroken, reconcileDeltaOnly, delayReason } =
    filters;

  const listParams = useCallback(
    (pageNum: number) => {
      const owner = ownerId || undefined;
      if (workView === "orders") {
        return receivablesApi.workOrders({
          ownerId: owner,
          q: q || undefined,
          overdue: overdue || undefined,
          clientId: clientId || undefined,
          aging: (aging || undefined) as ReceivablesAgingLabel | undefined,
          page: pageNum,
          pageSize: WORK_PAGE_SIZE,
        });
      }
      return receivablesApi.workClients({
        ownerId: owner,
        q: q || undefined,
        overdue: overdue || undefined,
        needsComment: needsComment || undefined,
        promisedToday: promisedToday || undefined,
        promiseBroken: promiseBroken || undefined,
        reconcileDeltaOnly: reconcileDeltaOnly || undefined,
        delayReason: delayReason || undefined,
        aging: (aging || undefined) as ReceivablesAgingLabel | undefined,
        sort: sort || undefined,
        dir: sort ? dir : undefined,
        page: pageNum,
        pageSize: WORK_PAGE_SIZE,
      });
    },
    [
      workView,
      ownerId,
      q,
      clientId,
      overdue,
      needsComment,
      promisedToday,
      promiseBroken,
      reconcileDeltaOnly,
      delayReason,
      aging,
      sort,
      dir,
    ],
  );

  const reload = useCallback(
    async (opts?: { silent?: boolean }) => {
      const requestId = ++requestRef.current;
      if (!opts?.silent) setLoading(true);
      try {
        const owner = ownerId || undefined;
        const [summaryRes, listRes, agingRes] = await Promise.all([
          receivablesApi.workSummary(owner),
          listParams(1),
          workView === "clients"
            ? receivablesApi.workAging(owner).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (requestId !== requestRef.current) return;
        const items = listRes.data.items ?? [];
        setSummary(summaryRes.data);
        setPage(1);
        setTotal(listRes.data.total ?? items.length);
        if (workView === "orders") {
          setOrders(items as WorkOrderRow[]);
          setClients([]);
          setSnoozedCount(0);
        } else {
          setClients(items as WorkClientRow[]);
          setOrders([]);
          setSnoozedCount("snoozedCount" in listRes.data ? (listRes.data.snoozedCount ?? 0) : 0);
        }
        setAgingBuckets(agingRes?.data.buckets ?? []);
        onLoadedRef.current?.();
      } catch {
        if (requestId === requestRef.current) pushToast(loadError, "error");
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    },
    [listParams, ownerId, workView, pushToast, loadError],
  );

  const loadMore = useCallback(async () => {
    if (loadingMore || loading) return;
    const nextPage = page + 1;
    if (clients.length + orders.length >= total) return;
    const requestId = ++requestRef.current;
    setLoadingMore(true);
    try {
      const listRes = await listParams(nextPage);
      if (requestId !== requestRef.current) return;
      const items = listRes.data.items ?? [];
      setPage(nextPage);
      setTotal(listRes.data.total ?? total);
      if (workView === "orders") {
        setOrders((prev) => [...prev, ...(items as WorkOrderRow[])]);
      } else {
        setClients((prev) => [...prev, ...(items as WorkClientRow[])]);
        if ("snoozedCount" in listRes.data) {
          setSnoozedCount(listRes.data.snoozedCount ?? 0);
        }
      }
    } catch {
      if (requestId === requestRef.current) pushToast(loadError, "error");
    } finally {
      if (requestId === requestRef.current) setLoadingMore(false);
    }
  }, [
    loadingMore,
    loading,
    page,
    clients.length,
    orders.length,
    total,
    listParams,
    workView,
    pushToast,
    loadError,
  ]);

  useEffect(() => {
    if (!enabled) return;
    void reload();
    return () => {
      requestRef.current += 1;
    };
  }, [enabled, reload]);

  const hasMore = (workView === "orders" ? orders.length : clients.length) < total;

  return {
    summary,
    clients,
    orders,
    agingBuckets,
    total,
    page,
    pageSize: WORK_PAGE_SIZE,
    snoozedCount,
    setSnoozedCount,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    reload,
    setClients,
  };
}
