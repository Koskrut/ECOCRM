"use client";

import { apiHttp } from "../../lib/api/client";
import { isTextSelected } from "@/lib/dom";
import { formatOrderAmount } from "@/lib/formatOrderAmount";
import { useCallback, useEffect, useMemo, useState } from "react";
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

/** Phase 3: orderStage as main axis. */
type OrderStage =
  | "NEW"
  | "CONFIRMED"
  | "AWAITING_PAYMENT"
  | "AWAITING_STOCK"
  | "READY_TO_SHIP"
  | "SHIPPED"
  | "AWAITING_RECEIPT"
  | "RECEIVED"
  | "COMPLETED"
  | "CANCELED"
  | "REFUSED"
  | "RETURN_IN_PROGRESS"
  | "FULLY_RETURNED";

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
};

/** Fallback when GET /orders/pipeline fails — mirrors backend order-pipeline.defaults.ts. */
const FALLBACK_MAIN_STAGE_ORDER: OrderStage[] = [
  "NEW",
  "AWAITING_PAYMENT",
  "AWAITING_STOCK",
  "CONFIRMED",
  "READY_TO_SHIP",
  "SHIPPED",
  "AWAITING_RECEIPT",
  "RECEIVED",
];

function isForwardStageTransition(from: OrderStage, to: OrderStage): boolean {
  if (from === to) return false;
  if (to === "CANCELED") return false;
  const fromIdx = FALLBACK_MAIN_STAGE_ORDER.indexOf(from);
  const toIdx = FALLBACK_MAIN_STAGE_ORDER.indexOf(to);
  if (fromIdx >= 0 && toIdx >= 0) return toIdx > fromIdx;
  return to === "COMPLETED";
}

const FALLBACK_FINAL_DROP_ZONES: { id: OrderStage; label: string; className: string }[] = [
  { id: "COMPLETED", label: "Завершено", className: "border-emerald-300 bg-emerald-50/80" },
  { id: "CANCELED", label: "Скасовано", className: "border-red-300 bg-red-50/80" },
  { id: "REFUSED", label: "Відмова", className: "border-orange-300 bg-orange-50/80" },
  { id: "RETURN_IN_PROGRESS", label: "Повернення", className: "border-amber-300 bg-amber-50/80" },
  { id: "FULLY_RETURNED", label: "Повернений", className: "border-amber-400 bg-amber-50/80" },
];

const STAGE_LABELS: Record<OrderStage, string> = {
  NEW: "Новий",
  CONFIRMED: "Підтверджено",
  AWAITING_PAYMENT: "Очікує оплату",
  AWAITING_STOCK: "Очікує на склад",
  READY_TO_SHIP: "Готово до відправки",
  SHIPPED: "Відправлено",
  AWAITING_RECEIPT: "Очікує отримання",
  RECEIVED: "Отримано",
  COMPLETED: "Завершено",
  CANCELED: "Скасовано",
  REFUSED: "Відмова",
  RETURN_IN_PROGRESS: "Повернення",
  FULLY_RETURNED: "Повернений",
};

function isKnownStage(s: string): s is OrderStage {
  return Object.keys(STAGE_LABELS).includes(s);
}

/** Legacy Order.status values → orderStage (mirrors backend order-status-sync.mapper). */
const LEGACY_STATUS_TO_STAGE: Record<string, OrderStage> = {
  NEW: "NEW",
  IN_WORK: "CONFIRMED",
  READY_TO_SHIP: "READY_TO_SHIP",
  SHIPPED: "SHIPPED",
  CONTROL_PAYMENT: "RECEIVED",
  SUCCESS: "COMPLETED",
  RETURNING: "RETURN_IN_PROGRESS",
  CANCELED: "CANCELED",
};

/** Resolve display stage: prefer orderStage; fall back to legacy status mapping. */
function resolveStage(o: BoardOrder): OrderStage {
  if (o.orderStage && isKnownStage(o.orderStage)) return o.orderStage;
  const legacy = o.status?.trim();
  if (legacy) {
    const mapped = LEGACY_STATUS_TO_STAGE[legacy];
    if (mapped) return mapped;
    if (isKnownStage(legacy)) return legacy;
  }
  return "NEW";
}

type PipelineStageRow = {
  stage: OrderStage;
  sortOrder: number;
  label: string;
  color: string | null;
  kanbanGroup: "MAIN" | "FINAL";
  allowedNext: OrderStage[];
};

const WAREHOUSE_KANBAN_STAGES: OrderStage[] = [
  "AWAITING_STOCK",
  "CONFIRMED",
  "READY_TO_SHIP",
  "SHIPPED",
];

const WAREHOUSE_TRANSITIONS: Partial<Record<OrderStage, OrderStage[]>> = {
  AWAITING_STOCK: ["CONFIRMED"],
  CONFIRMED: ["READY_TO_SHIP"],
  READY_TO_SHIP: ["SHIPPED"],
};

export function OrdersKanban({
  onOpenOrder,
  filters,
  refreshKey = 0,
  warehouseMode = false,
}: {
  onOpenOrder: (id: string) => void;
  filters?: BoardFilters;
  refreshKey?: number;
  warehouseMode?: boolean;
}) {
  const [pipeline, setPipeline] = useState<PipelineStageRow[] | null>(null);

  const [dragging, setDragging] = useState<{ orderId: string; from: OrderStage } | null>(null);
  const [dragOver, setDragOver] = useState<OrderStage | null>(null);
  /** На мобильных: индекс выбранной колонки (одна колонка на экран). */
  const [selectedStageIndex, setSelectedStageIndex] = useState(0);

  const loadPipeline = useCallback(async () => {
    try {
      const res = await apiHttp.get<{ stages: PipelineStageRow[] }>("/orders/pipeline");
      const stages = res.data?.stages;
      if (Array.isArray(stages) && stages.length >= 12) setPipeline(stages);
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
        allowedNext: WAREHOUSE_TRANSITIONS[stage] ?? [],
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
      allowedNext: [],
    }));
  }, [pipeline, warehouseMode]);

  const finalDropZones = useMemo(() => {
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
  }, [pipeline]);

  const loadColumnIds = useMemo((): OrderStage[] => {
    const stages = mainBoardStages.map((cfg) => cfg.stage);
    if (filters?.orderStage && isKnownStage(filters.orderStage)) {
      return stages.includes(filters.orderStage) ? [filters.orderStage] : [];
    }
    return stages;
  }, [mainBoardStages, filters?.orderStage]);

  const kanbanResetKey = useMemo(
    () =>
      JSON.stringify({
        refreshKey,
        warehouseMode,
        filters,
        stages: loadColumnIds,
      }),
    [refreshKey, warehouseMode, filters, loadColumnIds],
  );

  const buildParams = useCallback(
    (stage: OrderStage, page: number): Record<string, string> => {
      const params: Record<string, string> = {
        board: "true",
        withCompanyClient: "true",
        orderStages: stage,
        page: String(page),
        pageSize: String(KANBAN_PAGE_SIZE),
      };
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
      mainBoardStages.map((cfg) => ({
        id: cfg.stage,
        title: cfg.label,
        items: columnStates[cfg.stage]?.items ?? [],
      })),
    [mainBoardStages, columnStates],
  );

  useEffect(() => {
    if (columns.length > 0 && selectedStageIndex >= columns.length) {
      setSelectedStageIndex(Math.max(0, columns.length - 1));
    }
  }, [columns.length, selectedStageIndex]);

  /** Phase 3: PATCH /orders/:id/stage with toStage. */
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

  const handleDrop = useCallback(
    async (orderId: string, to: OrderStage) => {
      const from = dragging?.from;
      if (from && from === to) {
        setDragging(null);
        return;
      }
      const order = findOrder(orderId);
      if (from && isForwardStageTransition(from, to) && !order?.paymentType) {
        alert("Оберіть умови оплати перед переведенням замовлення на наступний етап.");
        setDragging(null);
        return;
      }
      if (to === "COMPLETED") {
        const debt = Number(order?.debtAmount ?? 0);
        if (debt > 0.009) {
          alert(
            "Неможливо завершити замовлення: оплата не закрита. Спочатку оплатіть або застосуйте залік.",
          );
          setDragging(null);
          return;
        }
      }
      if (warehouseMode && from) {
        const allowed = WAREHOUSE_TRANSITIONS[from];
        if (!allowed?.includes(to)) {
          alert(`Недопустимий перехід: ${STAGE_LABELS[from]} → ${STAGE_LABELS[to]}`);
          setDragging(null);
          return;
        }
      }
      if (from) {
        moveItem(orderId, from, to, (o) => ({ ...o, orderStage: to }));
      }
      try {
        await patchStage(orderId, to, "Moved in board");
        if (["COMPLETED", "CANCELED", "REFUSED", "RETURN_IN_PROGRESS", "FULLY_RETURNED"].includes(to)) {
          reloadAll();
        }
      } catch (error) {
        alert(error instanceof Error ? error.message : strings.kanban.moveFailed);
        reloadAll();
      } finally {
        setDragging(null);
      }
    },
    [dragging, findOrder, moveItem, patchStage, reloadAll, warehouseMode],
  );

  const boardEmpty = columns.every((col) => col.items.length === 0);
  if (anyInitialLoading && boardEmpty) {
    return <div className="text-sm text-zinc-500">{strings.kanban.loadingBoard}</div>;
  }
  if (firstError && boardEmpty) {
    return <div className="text-sm text-red-600">{firstError}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Мобильный переключатель стадий: одна колонка на экран */}
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

          return (
            <div
              key={st}
              className={[
                "rounded-lg border bg-zinc-50/80 transition-colors",
                "w-full min-w-0 md:w-[220px] md:min-w-[220px] md:flex-shrink-0",
                isSelectedOnMobile ? "block" : "hidden md:block",
                isOver ? "border-zinc-900" : "border-zinc-200",
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
                  isOver ? "bg-zinc-50" : "",
                ].join(" ")}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOver(st);
                }}
                onDragLeave={() => setDragOver((cur) => (cur === st ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(null);
                  const orderId = e.dataTransfer.getData("text/plain") || dragging?.orderId;
                  if (!orderId) return;
                  void handleDrop(orderId, st);
                }}
              >
                {colState?.initialLoading ? (
                  <div className="text-xs text-zinc-500">Завантаження…</div>
                ) : items.length === 0 ? (
                  <div className="text-xs text-zinc-500">Empty</div>
                ) : (
                  items.map((o) => {
                    const clientName =
                      o.client != null
                        ? `${o.client.lastName} ${o.client.firstName}`.trim() || "—"
                        : o.company?.name ?? "—";
                    const stage = resolveStage(o);
                  const stockFullyReady =
                    stage === "AWAITING_STOCK" && o.stockReadiness === "FULL";
                  return (
                    <button
                        key={o.id}
                        type="button"
                        title={stockFullyReady ? stockReadinessHint(o.stockReadiness) ?? undefined : undefined}
                        onClick={() => {
                          if (isTextSelected()) return;
                          onOpenOrder(o.id);
                        }}
                        draggable
                        onDragStart={(e) => {
                          setDragging({ orderId: o.id, from: stage });
                          e.dataTransfer.setData("text/plain", o.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          setDragOver(st);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragOver(null);
                          const orderId = e.dataTransfer.getData("text/plain") || dragging?.orderId;
                          if (!orderId) return;
                          void handleDrop(orderId, st);
                        }}
                        onDragEnd={() => {
                          setDragging(null);
                          setDragOver(null);
                        }}
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
                  <div className="py-1 text-center text-xs text-zinc-400">Завантаження…</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {dragging && !warehouseMode && (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex gap-4 bg-zinc-50/95 p-4 backdrop-blur-sm md:left-[var(--sidebar-px)]">
          {finalDropZones.map(({ id, label, className }) => {
            const isOver = dragOver === id;
            return (
              <div
                key={id}
                className={`flex flex-1 items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${className} ${
                  isOver ? "ring-2 ring-offset-2 ring-zinc-400" : ""
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOver(id);
                }}
                onDragLeave={() => setDragOver((cur) => (cur === id ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(null);
                  const orderId = e.dataTransfer.getData("text/plain") || dragging?.orderId;
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
