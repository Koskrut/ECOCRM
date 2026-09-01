"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { strings } from "@/locales";

export const KANBAN_PAGE_SIZE = 20;

export type KanbanColumnState<T> = {
  items: T[];
  total: number;
  page: number;
  initialLoading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
};

function emptyColumnState<T>(): KanbanColumnState<T> {
  return {
    items: [],
    total: 0,
    page: 0,
    initialLoading: false,
    loadingMore: false,
    hasMore: false,
    error: null,
  };
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function useKanbanInfiniteColumns<
  T extends { id: string },
  TColumn extends string = string,
>({
  columnIds,
  pageSize = KANBAN_PAGE_SIZE,
  buildParams,
  fetchPage,
  resetKey,
}: {
  columnIds: TColumn[];
  pageSize?: number;
  buildParams: (columnId: TColumn, page: number) => Record<string, string>;
  fetchPage: (params: Record<string, string>) => Promise<{ items: T[]; total: number }>;
  resetKey: unknown;
}) {
  const [columns, setColumns] = useState<Record<string, KanbanColumnState<T>>>({});
  const columnGenRef = useRef<Record<string, number>>({});
  const moreInFlightRef = useRef<Set<string>>(new Set());

  const bumpColumn = useCallback((columnId: string) => {
    columnGenRef.current[columnId] = (columnGenRef.current[columnId] ?? 0) + 1;
    moreInFlightRef.current.delete(columnId);
    return columnGenRef.current[columnId];
  }, []);

  const fetchColumnPage = useCallback(
    async (columnId: TColumn, page: number, mode: "initial" | "more") => {
      const myGen = columnGenRef.current[columnId] ?? 0;
      if (mode === "more") {
        if (moreInFlightRef.current.has(columnId)) return;
        moreInFlightRef.current.add(columnId);
      }
      setColumns((prev) => ({
        ...prev,
        [columnId]: {
          ...(prev[columnId] ?? emptyColumnState<T>()),
          ...(mode === "initial" ? { initialLoading: true, error: null } : { loadingMore: true }),
        },
      }));

      try {
        const { items, total } = await fetchPage(buildParams(columnId, page));
        if (myGen !== (columnGenRef.current[columnId] ?? 0)) return;

        setColumns((prev) => {
          const current = prev[columnId] ?? emptyColumnState<T>();
          const merged =
            mode === "initial" ? items : dedupeById([...current.items, ...items]);
          return {
            ...prev,
            [columnId]: {
              items: merged,
              total,
              page,
              initialLoading: false,
              loadingMore: false,
              hasMore: merged.length < total,
              error: null,
            },
          };
        });
      } catch (e) {
        if (myGen !== (columnGenRef.current[columnId] ?? 0)) return;
        const message = e instanceof Error ? e.message : strings.kanban.loadFailed;
        setColumns((prev) => ({
          ...prev,
          [columnId]: {
            ...(prev[columnId] ?? emptyColumnState<T>()),
            initialLoading: false,
            loadingMore: false,
            error: message,
          },
        }));
      } finally {
        if (mode === "more") moreInFlightRef.current.delete(columnId);
      }
    },
    [buildParams, fetchPage],
  );

  useEffect(() => {
    for (const id of columnIds) bumpColumn(id);
    const next: Record<string, KanbanColumnState<T>> = {};
    for (const id of columnIds) {
      next[id] = { ...emptyColumnState<T>(), initialLoading: true };
    }
    setColumns(next);

    for (const id of columnIds) {
      void fetchColumnPage(id, 1, "initial");
    }
  }, [columnIds.join("|"), resetKey, fetchColumnPage, bumpColumn]);

  const loadMore = useCallback(
    (columnId: TColumn) => {
      const col = columns[columnId];
      if (!col || col.initialLoading || col.loadingMore || !col.hasMore) return;
      if (moreInFlightRef.current.has(columnId)) return;
      void fetchColumnPage(columnId, col.page + 1, "more");
    },
    [columns, fetchColumnPage],
  );

  const reloadColumn = useCallback(
    (columnId: TColumn) => {
      bumpColumn(columnId);
      void fetchColumnPage(columnId, 1, "initial");
    },
    [bumpColumn, fetchColumnPage],
  );

  const reloadAll = useCallback(() => {
    for (const id of columnIds) bumpColumn(id);
    for (const id of columnIds) {
      void fetchColumnPage(id, 1, "initial");
    }
  }, [bumpColumn, columnIds, fetchColumnPage]);

  const updateItem = useCallback((itemId: string, updater: (item: T) => T) => {
    setColumns((prev) => {
      const next = { ...prev };
      for (const columnId of Object.keys(next)) {
        const col = next[columnId];
        const idx = col.items.findIndex((x) => x.id === itemId);
        if (idx === -1) continue;
        const items = [...col.items];
        items[idx] = updater(items[idx]);
        next[columnId] = { ...col, items };
        break;
      }
      return next;
    });
  }, []);

  const moveItem = useCallback(
    (itemId: string, fromColumnId: TColumn, toColumnId: TColumn, updater: (item: T) => T) => {
      setColumns((prev) => {
        const from = prev[fromColumnId];
        if (!from) return prev;
        const item = from.items.find((x) => x.id === itemId);
        if (!item) return prev;

        const nextFromItems = from.items.filter((x) => x.id !== itemId);
        const nextFrom = {
          ...from,
          items: nextFromItems,
          total: Math.max(0, from.total - 1),
        };

        if (!(toColumnId in prev) || fromColumnId === toColumnId) {
          return { ...prev, [fromColumnId]: nextFrom };
        }

        const to = prev[toColumnId] ?? emptyColumnState<T>();
        const nextToItems = dedupeById([...to.items, updater(item)]);

        return {
          ...prev,
          [fromColumnId]: nextFrom,
          [toColumnId]: {
            ...to,
            items: nextToItems,
            total: to.total + 1,
          },
        };
      });
    },
    [],
  );

  const anyInitialLoading = columnIds.some((id) => columns[id]?.initialLoading);
  const firstError = columnIds.map((id) => columns[id]?.error).find(Boolean) ?? null;

  return {
    columns,
    loadMore,
    reloadColumn,
    reloadAll,
    updateItem,
    moveItem,
    anyInitialLoading,
    firstError,
  };
}
