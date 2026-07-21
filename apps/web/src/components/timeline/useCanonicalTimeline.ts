"use client";

import { TIMELINE_PAGE_SIZE } from "@crm/contracts/timeline";
import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import type {
  TimelineEntityType,
  TimelineItem,
  TimelineKind,
  TimelinePage,
  TimelineSource,
} from "./types";

export type CanonicalTimelineFilters = {
  sources?: TimelineSource[];
  kinds?: TimelineKind[];
};

export type UseCanonicalTimelineArgs = {
  entityType: TimelineEntityType;
  entityId: string;
  pageSize?: number;
  filters?: CanonicalTimelineFilters;
};

export type CanonicalTimelineState = {
  items: TimelineItem[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  /** Optimistically remove an item (e.g. after delete). */
  removeItem: (id: string) => void;
};

function buildParams(
  pageSize: number,
  cursor: string | null,
  filters?: CanonicalTimelineFilters,
): Record<string, string | string[] | number> {
  const params: Record<string, string | string[] | number> = { limit: pageSize };
  if (cursor) params.cursor = cursor;
  if (filters?.sources?.length) params.source = filters.sources;
  if (filters?.kinds?.length) params.kind = filters.kinds;
  return params;
}

export function useCanonicalTimeline({
  entityType,
  entityId,
  pageSize = TIMELINE_PAGE_SIZE,
  filters,
}: UseCanonicalTimelineArgs): CanonicalTimelineState {
  const url = `timeline/${entityType}/${entityId}`;
  const generationRef = useRef(0);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filterKey = JSON.stringify(filters ?? {});

  const fetchInitial = useCallback(
    async (signal?: AbortSignal) => {
      const myId = ++generationRef.current;
      setLoading(true);
      setError(null);
      setNextCursor(null);
      try {
        const res = await apiHttp.get<TimelinePage>(url, {
          params: buildParams(pageSize, null, filters),
          signal,
        });
        if (myId !== generationRef.current) return;
        setItems(res.data?.items ?? []);
        setNextCursor(res.data?.nextCursor ?? null);
      } catch (e: unknown) {
        if (axios.isCancel(e)) return;
        if (myId !== generationRef.current) return;
        setItems([]);
        setError(e instanceof Error ? e.message : "Не вдалося завантажити стрічку");
      } finally {
        if (myId === generationRef.current) setLoading(false);
      }
    },
    [filters, pageSize, url],
  );

  useEffect(() => {
    const ac = new AbortController();
    void fetchInitial(ac.signal);
    return () => ac.abort();
  }, [fetchInitial, filterKey]);

  const refresh = useCallback(async () => {
    await fetchInitial();
  }, [fetchInitial]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore || loading) return;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await apiHttp.get<TimelinePage>(url, {
        params: buildParams(pageSize, nextCursor, filters),
      });
      const batch = res.data?.items ?? [];
      setItems((prev) => {
        const seen = new Set(prev.map((it) => it.id));
        const merged = [...prev];
        for (const it of batch) {
          if (!seen.has(it.id)) {
            seen.add(it.id);
            merged.push(it);
          }
        }
        return merged;
      });
      setNextCursor(res.data?.nextCursor ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Не вдалося завантажити ще");
    } finally {
      setLoadingMore(false);
    }
  }, [filters, loading, loadingMore, nextCursor, pageSize, url]);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  return { items, nextCursor, loading, loadingMore, error, refresh, loadMore, removeItem };
}
