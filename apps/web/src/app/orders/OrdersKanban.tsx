"use client";

import { apiHttp } from "../../lib/api/client";
import { isTextSelected } from "@/lib/dom";
import { formatOrderAmount } from "@/lib/formatOrderAmount";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KanbanLoadSentinel,
  KANBAN_COLUMN_BODY_CLASS,
} from "@/components/kanban/KanbanLoadSentinel";
import {
  KANBAN_PAGE_SIZE,
  useKanbanInfiniteColumns,
} from "@/components/kanban/useKanbanInfiniteColumns";
import { strings } from "@/locales";
import { AlertTriangle } from "lucide-react";
import { StatusBadge } from "../../components/StatusBadge";
import { DocumentsRequestedBadge } from "@/components/orders/DocumentsRequestedBadge";
import { OrderPromoBadge } from "@/components/orders/OrderPromoBadge";
import {
  StockReadinessBadge,
  stockReadinessHint,
  type OrderStockReadiness,
} from "@/components/orders/StockReadinessBadge";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import {
  allowedNextForStage,
  FALLBACK_FINAL_DROP_ZONES,
  FALLBACK_MAIN_STAGE_ORDER,
  getKanbanDropBlock,
  isFinalOrderStage,
  isKnownStage,
  resolveStage,
  STAGE_LABELS,
  WAREHOUSE_KANBAN_STAGES,
  type KanbanDropBlockCode,
  type OrderStage,
} from "./orders-kanban.util";

type BoardOrder = {
  id: string;
  orderNumber: string;
  status: string;
  orderStage?: string | null;
  totalAmount: number;
  currency: string;
  exchangeRate?: number | null;
  paymentType?: string | null;
  debtAmount?: number;
  /** Closed/open return amount; >0 on RECEIVED/COMPLETED means partial return. */
  returnAdjustmentAmount?: number | null;
  updatedAt?: string;
  createdAt?: string;
  /** Same TTN number linked to another order */
  ttnSharedAcrossOrders?: boolean;
  stockReadiness?: OrderStockReadiness | null;
  company?: { id: string; name: string } | null;
  client?: { id: string; firstName: string; lastName: string; phone: string } | null;
  warehouseId?: string | null;
  warehouse?: { id: string; name: string } | null;
  documentsRequested?: boolean | null;
  hasPromo?: boolean | null;
};

type OrdersListResponse = {
  items: BoardOrder[];
  total?: number;
  page?: number;
  pageSize?: number;
};

type BoardColumn = {
  id: OrderStage;
  title: string;
  items: BoardOrder[];
};

type BoardFilters = {
  orderStage?: string;
  status?: string;
  ownerId?: string;
  attention?: string;
  attentionPeriod?: string;
  amountFrom?: string;
  amountTo?: string;
  q?: string;
  paymentType?: string;
  paymentStatus?: string;
  hasTtn?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  ids?: string;
  overdue?: string;
  dueSoon?: string;
  hasDebt?: string;
  hasDueDate?: string;
};

type PipelineStageRow = {
  stage: OrderStage;
  sortOrder: number;
  label: string;
  color: string | null;
  kanbanGroup: "MAIN" | "FINAL";
  allowedNext: OrderStage[];
};

const tr = strings.kanban;

function dropBlockMessage(code: KanbanDropBlockCode, from: OrderStage, to: OrderStage): string {
  switch (code) {
    case "payment_type":
      return tr.paymentTypeRequired;
    case "complete_debt":
      return tr.completeBlockedDebt;
    case "awaiting_payment_prepay":
      return tr.awaitingPaymentPrepay;
    case "prepay_must_await_payment":
      return tr.prepayMustAwaitPayment;
    case "deferred_no_awaiting_payment":
      return tr.deferredNoAwaitingPayment;
    default:
      return tr.invalidTransition(STAGE_LABELS[from], STAGE_LABELS[to]);
  }
}

export function OrdersKanban({
  onOpenOrder,
  filters,
  refreshKey = 0,
  warehouseMode = false,
  warehouseRestricted = false,
}: {
  onOpenOrder: (id: string) => void;
  filters?: BoardFilters;
  refreshKey?: number;
  warehouseMode?: boolean;
  /** WAREHOUSE role on the full board: keep all columns, restrict drops. */
  warehouseRestricted?: boolean;
}) {
  const restrictTransitions = warehouseMode || warehouseRestricted;
  const [pipeline, setPipeline] = useState<PipelineStageRow[] | null>(null);

  const [dragging, setDragging] = useState<{ orderId: string; from: OrderStage } | null>(null);
  const draggingRef = useRef(dragging);
  draggingRef.current = dragging;
  const [dragOver, setDragOver] = useState<OrderStage | null>(null);
  const [selectedStageIndex, setSelectedStageIndex] = useState(0);

  const loadPipeline = useCallback(async () => {
    try {
      const res = await apiHttp.get<{ stages: PipelineStageRow[] }>("/orders/pipeline");
      const stages = res.data?.stages;
      if (Array.isArray(stages) && stages.length > 0) setPipeline(stages);
      else setPipeline(null);
    } catch {
      setPipeline(null);
    }
  }, []);

  useEffect(() => {
    void loadPipeline();
  }, [loadPipeline, refreshKey]);

  const mainBoardStages = useMemo((): PipelineStageRow[] => {
    const build = (stages: OrderStage[]): PipelineStageRow[] =>
      stages.map((stage, idx) => ({
        stage,
        sortOrder: idx,
        label: STAGE_LABELS[stage],
        color: null,
        kanbanGroup: "MAIN" as const,
        allowedNext: allowedNextForStage(stage, undefined, restrictTransitions),
      }));

    if (warehouseMode) return build(WAREHOUSE_KANBAN_STAGES);

    if (pipeline?.length) {
      const mains = pipeline
        .filter((s) => s.kanbanGroup === "MAIN")
        .sort((a, b) => a.sortOrder - b.sortOrder);
      if (mains.length > 0) return mains;
    }
    return FALLBACK_MAIN_STAGE_ORDER.map((stage, idx) => ({
      stage,
      sortOrder: idx,
      label: STAGE_LABELS[stage],
      color: null,
      kanbanGroup: "MAIN" as const,
      allowedNext: allowedNextForStage(stage, undefined, restrictTransitions),
    }));
  }, [pipeline, warehouseMode, restrictTransitions]);

  const finalDropZones = useMemo(() => {
    if (restrictTransitions) return [];
    if (pipeline?.length) {
      const finals = pipeline
        .filter((s) => s.kanbanGroup === "FINAL")
        .sort((a, b) => a.sortOrder - b.sortOrder);
      if (finals.length > 0) {
        return finals.map((s) => ({
          id: s.stage,
          label: s.label,
          className: s.color ?? "border-zinc-200 bg-zinc-50/80",
        }));
      }
    }
    return FALLBACK_FINAL_DROP_ZONES;
  }, [pipeline, restrictTransitions]);

  const allowedNextByStage = useMemo(() => {
    const map = new Map<OrderStage, OrderStage[]>();
    const rows = pipeline?.length ? pipeline : [...mainBoardStages];
    for (const row of rows) {
      map.set(row.stage, allowedNextForStage(row.stage, row.allowedNext, restrictTransitions));
    }
    for (const stage of Object.keys(STAGE_LABELS) as OrderStage[]) {
      if (!map.has(stage)) {
        map.set(stage, allowedNextForStage(stage, undefined, restrictTransitions));
      }
    }
    return map;
  }, [pipeline, mainBoardStages, restrictTransitions]);

  const visibleStages = useMemo((): PipelineStageRow[] => {
    const filterStage = filters?.orderStage;
    if (!filterStage || !isKnownStage(filterStage)) return mainBoardStages;

    const main = mainBoardStages.find((s) => s.stage === filterStage);
    if (main) return [main];

    const final = finalDropZones.find((z) => z.id === filterStage);
    if (final) {
      return [
        {
          stage: final.id,
          sortOrder: 0,
          label: final.label,
          color: null,
          kanbanGroup: "FINAL",
          allowedNext: allowedNextByStage.get(final.id) ?? [],
        },
      ];
    }
    return [];
  }, [filters?.orderStage, mainBoardStages, finalDropZones, allowedNextByStage]);

  const loadColumnIds = useMemo((): OrderStage[] => visibleStages.map((s) => s.stage), [visibleStages]);

  const kanbanResetKey = useMemo(
    () =>
      JSON.stringify({
        refreshKey,
        warehouseMode,
        warehouseRestricted,
        filters,
        stages: loadColumnIds,
      }),
    [refreshKey, warehouseMode, warehouseRestricted, filters, loadColumnIds],
  );

  const buildParams = useCallback(
    (stage: OrderStage, page: number): Record<string, string> => {
      const params: Record<string, string> = {
        withCompanyClient: "true",
        orderStages: stage,
        page: String(page),
        pageSize: String(KANBAN_PAGE_SIZE),
      };
      if (!isFinalOrderStage(stage)) params.board = "true";
      if (filters?.status) params.status = filters.status;
      if (filters?.ownerId) params.ownerId = filters.ownerId;
      if (filters?.attention) params.attention = filters.attention;
      if (filters?.attention === "stuck" && filters?.attentionPeriod) {
        params.attentionPeriod = filters.attentionPeriod;
      }
      if (filters?.amountFrom) params.amountFrom = filters.amountFrom;
      if (filters?.amountTo) params.amountTo = filters.amountTo;
      if (filters?.q?.trim()) params.q = filters.q.trim();
      if (filters?.paymentType) params.paymentType = filters.paymentType;
      if (filters?.paymentStatus) params.paymentStatus = filters.paymentStatus;
      if (filters?.hasTtn) params.hasTtn = filters.hasTtn;
      if (filters?.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters?.dateTo) params.dateTo = filters.dateTo;
      if (filters?.sortBy) params.sortBy = filters.sortBy;
      if (filters?.sortDir) params.sortDir = filters.sortDir;
      if (filters?.ids) params.ids = filters.ids;
      if (filters?.overdue === "true") params.overdue = "true";
      if (filters?.dueSoon === "true") params.dueSoon = "true";
      if (filters?.hasDebt === "true") params.hasDebt = "true";
      if (filters?.hasDueDate === "true") params.hasDueDate = "true";
      if (warehouseMode) {
        params.sortBy = "createdAt";
        params.sortDir = "asc";
      }
      return params;
    },
    [
      filters?.amountFrom,
      filters?.amountTo,
      filters?.attention,
      filters?.attentionPeriod,
      filters?.dateFrom,
      filters?.dateTo,
      filters?.hasTtn,
      filters?.ids,
      filters?.overdue,
      filters?.dueSoon,
      filters?.hasDebt,
      filters?.hasDueDate,
      filters?.ownerId,
      filters?.paymentStatus,
      filters?.paymentType,
      filters?.q,
      filters?.sortBy,
      filters?.sortDir,
      filters?.status,
      warehouseMode,
    ],
  );

  const fetchPage = useCallback(async (params: Record<string, string>) => {
    const res = await apiHttp.get<OrdersListResponse>("/orders", { params });
    const data = res.data ?? { items: [] };
    return {
      items: data.items ?? [],
      total: data.total ?? data.items?.length ?? 0,
    };
  }, []);

  const {
    columns: columnStates,
    loadMore,
    reloadAll,
    reloadColumn,
    moveItem,
    anyInitialLoading,
    firstError,
  } = useKanbanInfiniteColumns<BoardOrder, OrderStage>({
    columnIds: loadColumnIds,
    buildParams,
    fetchPage,
    resetKey: kanbanResetKey,
  });

  const columns: BoardColumn[] = useMemo(
    () =>
      visibleStages.map((cfg) => ({
        id: cfg.stage,
        title: cfg.label,
        items: columnStates[cfg.stage]?.items ?? [],
      })),
    [visibleStages, columnStates],
  );

  useEffect(() => {
    if (columns.length > 0 && selectedStageIndex >= columns.length) {
      setSelectedStageIndex(Math.max(0, columns.length - 1));
    }
  }, [columns.length, selectedStageIndex]);

  const patchStage = useCallback(async (orderId: string, toStage: OrderStage, reason?: string) => {
    const res = await apiHttp.patch(`/orders/${orderId}/stage`, { toStage, reason });
    return res.data ?? null;
  }, []);

  const findOrder = useCallback(
    (orderId: string): BoardOrder | undefined => {
      for (const col of Object.values(columnStates)) {
        const found = col.items.find((x) => x.id === orderId);
        if (found) return found;
      }
      return undefined;
    },
    [columnStates],
  );

  const dropBlockFor = useCallback(
    (orderId: string, from: OrderStage, to: OrderStage): KanbanDropBlockCode | null => {
      const order = findOrder(orderId);
      return getKanbanDropBlock({
        from,
        to,
        paymentType: order?.paymentType,
        debtAmount: order?.debtAmount,
        allowedNext: allowedNextByStage.get(from) ?? [],
      });
    },
    [allowedNextByStage, findOrder],
  );

  const isDropTargetAllowed = useCallback(
    (to: OrderStage) => {
      const drag = draggingRef.current;
      if (!drag) return true;
      if (drag.from === to) return true;
      return dropBlockFor(drag.orderId, drag.from, to) === null;
    },
    [dropBlockFor],
  );

  const handleDrop = useCallback(
    async (orderId: string, to: OrderStage) => {
      const from = draggingRef.current?.from ?? dragging?.from;
      if (!from || from === to) {
        draggingRef.current = null;
        setDragging(null);
        return;
      }
      const block = dropBlockFor(orderId, from, to);
      if (block) {
        alert(dropBlockMessage(block, from, to));
        setDragging(null);
        return;
      }
      moveItem(orderId, from, to, (o) => ({ ...o, orderStage: to }));
      try {
        await patchStage(orderId, to, "Moved in board");
        if (isFinalOrderStage(to) || !loadColumnIds.includes(to)) {
          reloadAll();
        }
      } catch (error) {
        alert(error instanceof Error ? error.message : tr.moveFailed);
        reloadAll();
      } finally {
        setDragging(null);
      }
    },
    [dragging, dropBlockFor, loadColumnIds, moveItem, patchStage, reloadAll],
  );

  const clearDrag = useCallback(() => {
    requestAnimationFrame(() => {
      setDragging(null);
      setDragOver(null);
    });
  }, []);

  const boardEmpty = columns.every((col) => col.items.length === 0);
  if (anyInitialLoading && boardEmpty) {
    return <div className="text-sm text-zinc-500">{tr.loadingBoard}</div>;
  }
  if (firstError && boardEmpty) {
    return <div className="text-sm text-red-600">{firstError}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="md:hidden overflow-x-auto overflow-y-hidden pb-2 -mx-1">
        <div className="flex gap-2 flex-nowrap min-w-0">
          {columns.map((col, idx) => (
            <button
              key={col.id}
              type="button"
              onClick={() => setSelectedStageIndex(idx)}
              className={[
                "shrink-0 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors",
                selectedStageIndex === idx
                  ? "border-accent-500 bg-accent-500 text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
              ].join(" ")}
            >
              <span className="whitespace-nowrap">{col.title}</span>
              <span className="ml-1.5 text-xs opacity-80">
                ({columnStates[col.id]?.total ?? col.items.length})
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:flex-nowrap md:gap-4 md:overflow-x-auto pb-2">
        {columns.map((col, colIndex) => {
          const st = col.id;
          const items = col.items ?? [];
          const colState = columnStates[st];
          const isOver = dragOver === st;
          const isSelectedOnMobile = colIndex === selectedStageIndex;
          const dropAllowed = isDropTargetAllowed(st);

          return (
            <div
              key={st}
              className={[
                "rounded-lg border bg-zinc-50/80 transition-colors",
                "w-full min-w-0 md:w-[220px] md:min-w-[220px] md:flex-shrink-0",
                isSelectedOnMobile ? "block" : "hidden md:block",
                isOver && dropAllowed ? "border-zinc-900" : "border-zinc-200",
              ].join(" ")}
            >
              <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
                <div className="text-sm font-semibold text-zinc-900">{col.title}</div>
                <div className="text-xs text-zinc-500">{colState?.total ?? items.length}</div>
              </div>

              <div
                className={[
                  KANBAN_COLUMN_BODY_CLASS,
                  "min-h-[200px] transition-colors",
                  isOver && dropAllowed ? "bg-zinc-50" : "",
                ].join(" ")}
                onDragOver={(e) => {
                  e.preventDefault();
                  const allowed = isDropTargetAllowed(st);
                  e.dataTransfer.dropEffect = allowed ? "move" : "none";
                  if (allowed) setDragOver(st);
                }}
                onDragLeave={() => setDragOver((cur) => (cur === st ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(null);
                  const orderId = e.dataTransfer.getData("text/plain") || draggingRef.current?.orderId;
                  if (!orderId) return;
                  void handleDrop(orderId, st);
                }}
              >
                {colState?.initialLoading ? (
                  <div className="text-xs text-zinc-500">{tr.loadingColumn}</div>
                ) : colState?.error && items.length === 0 ? (
                  <div className="space-y-2">
                    <div className="text-xs text-red-600">{colState.error}</div>
                    <button
                      type="button"
                      onClick={() => reloadColumn(st)}
                      className="text-xs font-medium text-zinc-700 underline"
                    >
                      {tr.retry}
                    </button>
                  </div>
                ) : items.length === 0 ? (
                  <div className="text-xs text-zinc-500">{tr.emptyColumn}</div>
                ) : (
                  items.map((o) => {
                    const clientName =
                      o.client != null
                        ? `${o.client.lastName} ${o.client.firstName}`.trim() || "—"
                        : o.company?.name ?? "—";
                    const stage = resolveStage(o);
                    const stockFullyReady = stage === "AWAITING_STOCK" && o.stockReadiness === "FULL";
                    const canDrag = (allowedNextByStage.get(st) ?? []).length > 0;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        title={stockFullyReady ? stockReadinessHint(o.stockReadiness) ?? undefined : undefined}
                        onClick={() => {
                          if (isTextSelected()) return;
                          onOpenOrder(o.id);
                        }}
                        draggable={canDrag}
                        onDragStart={(e) => {
                          if (!canDrag) {
                            e.preventDefault();
                            return;
                          }
                          const payload = { orderId: o.id, from: st };
                          draggingRef.current = payload;
                          setDragging(payload);
                          e.dataTransfer.setData("text/plain", o.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          const allowed = isDropTargetAllowed(st);
                          e.dataTransfer.dropEffect = allowed ? "move" : "none";
                          if (allowed) setDragOver(st);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragOver(null);
                          const orderId = e.dataTransfer.getData("text/plain") || draggingRef.current?.orderId;
                          if (!orderId) return;
                          void handleDrop(orderId, st);
                        }}
                        onDragEnd={clearDrag}
                        className={[
                          "w-full rounded-xl border bg-white p-4 text-left transition-shadow",
                          stockFullyReady
                            ? "border-emerald-400/80 shadow-[0_0_0_1px_rgba(52,211,153,0.45),0_0_18px_rgba(16,185,129,0.55)] hover:shadow-[0_0_0_1px_rgba(52,211,153,0.55),0_0_22px_rgba(16,185,129,0.7)]"
                            : "border-zinc-200 shadow-sm hover:shadow-md",
                          dragging?.orderId === o.id ? "opacity-60" : "",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1 font-medium text-zinc-900">
                            <span className="truncate">{o.orderNumber}</span>
                            {o.ttnSharedAcrossOrders ? (
                              <span
                                title="Номер ТТН також привʼязаний до іншого замовлення"
                                className="inline-flex shrink-0 text-amber-600"
                              >
                                <AlertTriangle className="h-3.5 w-3.5" />
                              </span>
                            ) : null}
                            <DocumentsRequestedBadge documentsRequested={o.documentsRequested} size="xs" />
                            <OrderPromoBadge hasPromo={o.hasPromo} size="xs" />
                          </span>
                          {o.paymentType && (
                            <span
                              className={[
                                "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                                o.paymentType === "PREPAYMENT"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-amber-100 text-amber-800",
                              ].join(" ")}
                            >
                              {o.paymentType === "PREPAYMENT" ? "Передопл." : "Відтерм."}
                            </span>
                          )}
                        </div>
                        {o.createdAt && (
                          <div className="mt-1 text-xs text-zinc-500">
                            {formatRelativeTime(o.createdAt)}
                          </div>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <StatusBadge variant="order" status={o.status} orderStage={o.orderStage} />
                          {stage === "AWAITING_STOCK" && o.stockReadiness === "PARTIAL" ? (
                            <StockReadinessBadge readiness={o.stockReadiness} size="xs" />
                          ) : null}
                          {(stage === "RECEIVED" || stage === "COMPLETED") &&
                          Number(o.returnAdjustmentAmount ?? 0) > 0 ? (
                            <span
                              title="Є часткове повернення"
                              className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900"
                            >
                              Частк. повернення
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-3 text-[10px] font-medium uppercase text-zinc-500">
                          Сума
                        </div>
                        <div className="text-sm font-medium text-zinc-900">
                          {formatOrderAmount(o.totalAmount, o.currency, o.exchangeRate)}
                        </div>
                        <div className="mt-2 text-[10px] font-medium uppercase text-zinc-500">
                          Клієнт
                        </div>
                        <div className="mt-0.5 truncate text-xs text-zinc-700">{clientName}</div>
                        <div className="mt-2 text-[10px] font-medium uppercase text-zinc-500">
                          Склад
                        </div>
                        <div className="mt-0.5 truncate text-xs text-zinc-700">
                          {o.warehouse?.name ?? "—"}
                        </div>
                      </button>
                    );
                  })
                )}
                {colState?.hasMore ? (
                  <KanbanLoadSentinel
                    disabled={colState.loadingMore || colState.initialLoading}
                    onVisible={() => loadMore(st)}
                  />
                ) : null}
                {colState?.loadingMore ? (
                  <div className="py-1 text-center text-xs text-zinc-400">{tr.loadingColumn}</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {dragging && finalDropZones.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex gap-4 bg-zinc-50/95 p-4 backdrop-blur-sm md:left-[var(--sidebar-px)]">
          {finalDropZones.map(({ id, label, className }) => {
            const isOver = dragOver === id;
            const dropAllowed = isDropTargetAllowed(id);
            return (
              <div
                key={id}
                className={`flex flex-1 items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${className} ${
                  isOver && dropAllowed ? "ring-2 ring-offset-2 ring-zinc-400" : ""
                } ${dropAllowed ? "" : "opacity-40"}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  const allowed = isDropTargetAllowed(id);
                  e.dataTransfer.dropEffect = allowed ? "move" : "none";
                  if (allowed) setDragOver(id);
                }}
                onDragLeave={() => setDragOver((cur) => (cur === id ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(null);
                  const orderId = e.dataTransfer.getData("text/plain") || draggingRef.current?.orderId;
                  if (!orderId) return;
                  void handleDrop(orderId, id);
                }}
              >
                <span className="text-sm font-medium text-zinc-700">{label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
