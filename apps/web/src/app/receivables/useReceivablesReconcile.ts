"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/feedback";
import { strings } from "@/locales";
import {
  receivablesApi,
  type ReceivablesSnapshot,
  type ReconciliationLine,
  type ReconcileStatusFilter,
} from "@/lib/api/resources/receivables";

export type ReceivablesReconcileSummary = Awaited<
  ReturnType<typeof receivablesApi.reconciliationSummary>
>["data"];

export const RECONCILE_PAGE_SIZE = 50;

export type UseReceivablesReconcileParams = {
  /** Loads summary/rows automatically while enabled and whenever params change. */
  enabled: boolean;
  snapshotId: string;
  ownerId: string;
  q: string;
  deltasOnly: boolean;
  reconcileStatus: string;
};

/** Snapshots list loads once on mount regardless of `enabled`. */
export function useReceivablesReconcile({
  enabled,
  snapshotId,
  ownerId,
  q,
  deltasOnly,
  reconcileStatus,
}: UseReceivablesReconcileParams) {
  const { pushToast } = useToast();
  const loadError = strings.receivables.loadError;
  const [snapshots, setSnapshots] = useState<ReceivablesSnapshot[]>([]);
  const [snapshotsLoaded, setSnapshotsLoaded] = useState(false);
  const [summary, setSummary] = useState<ReceivablesReconcileSummary | null>(null);
  const [rows, setRows] = useState<ReconciliationLine[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestRef = useRef(0);

  const reloadSnapshots = useCallback(async () => {
    try {
      const res = await receivablesApi.listSnapshots(30);
      const items = res.data.items ?? [];
      setSnapshots(items);
      return items;
    } catch {
      pushToast(loadError, "error");
      return [];
    } finally {
      setSnapshotsLoaded(true);
    }
  }, [pushToast, loadError]);

  useEffect(() => {
    void reloadSnapshots();
  }, [reloadSnapshots]);

  const listParams = useCallback(
    (pageNum: number) => {
      if (!snapshotId) return null;
      return receivablesApi.listReconciliation({
        snapshotId,
        ownerId: ownerId || undefined,
        q: q || undefined,
        deltasOnly: reconcileStatus ? false : deltasOnly,
        status: (reconcileStatus || undefined) as ReconcileStatusFilter | undefined,
        page: pageNum,
        pageSize: RECONCILE_PAGE_SIZE,
      });
    },
    [snapshotId, ownerId, q, deltasOnly, reconcileStatus],
  );

  const reload = useCallback(
    async (opts?: { silent?: boolean }) => {
      const requestId = ++requestRef.current;
      if (!opts?.silent) setLoading(true);
      try {
        if (!snapshotId) {
          if (requestId !== requestRef.current) return;
          setSummary(null);
          setRows([]);
          setTotal(0);
          setPage(1);
          return;
        }
        const listReq = listParams(1);
        const [summaryRes, listRes] = await Promise.all([
          receivablesApi.reconciliationSummary(snapshotId, ownerId || undefined),
          listReq!,
        ]);
        if (requestId !== requestRef.current) return;
        setSummary(summaryRes.data);
        setRows(listRes.data.items ?? []);
        setTotal(listRes.data.total ?? 0);
        setPage(1);
      } catch {
        if (requestId === requestRef.current) pushToast(loadError, "error");
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    },
    [snapshotId, ownerId, listParams, pushToast, loadError],
  );

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !snapshotId) return;
    if (rows.length >= total) return;
    const nextPage = page + 1;
    const requestId = ++requestRef.current;
    setLoadingMore(true);
    try {
      const listReq = listParams(nextPage);
      if (!listReq) return;
      const listRes = await listReq;
      if (requestId !== requestRef.current) return;
      setRows((prev) => [...prev, ...(listRes.data.items ?? [])]);
      setTotal(listRes.data.total ?? total);
      setPage(nextPage);
    } catch {
      if (requestId === requestRef.current) pushToast(loadError, "error");
    } finally {
      if (requestId === requestRef.current) setLoadingMore(false);
    }
  }, [
    loadingMore,
    loading,
    snapshotId,
    rows.length,
    total,
    page,
    listParams,
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

  return {
    snapshots,
    snapshotsLoaded,
    summary,
    rows,
    total,
    page,
    pageSize: RECONCILE_PAGE_SIZE,
    loading,
    loadingMore,
    hasMore: rows.length < total,
    loadMore,
    reload,
    reloadSnapshots,
  };
}
