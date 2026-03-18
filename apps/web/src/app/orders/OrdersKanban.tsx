"use client";

import { apiHttp } from "../../lib/api/client";
import { isTextSelected } from "@/lib/dom";
import { formatOrderAmount } from "@/lib/formatOrderAmount";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusBadge } from "../../components/StatusBadge";

function formatRelativeTime(createdAt: string): string {
  const date = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffMins < 1) return "щойно";
  if (diffMins < 60) return `${diffMins} хв тому`;
  if (diffHours < 24) return `${diffHours} год тому`;
  if (diffDays < 7) return `${diffDays} дн тому`;
  return date.toLocaleDateString("uk-UA", { day: "numeric", month: "short", year: "numeric" });
}

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
  | "RETURN_IN_PROGRESS";

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
  updatedAt?: string;
  createdAt?: string;
  company?: { id: string; name: string } | null;
  client?: { id: string; firstName: string; lastName: string; phone: string } | null;
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

/** Main row: active stages (board API excludes COMPLETED, CANCELED, REFUSED, RETURN_IN_PROGRESS). */
const MAIN_STAGE_ORDER: OrderStage[] = [
  "NEW",
  "CONFIRMED",
  "AWAITING_PAYMENT",
  "AWAITING_STOCK",
  "READY_TO_SHIP",
  "SHIPPED",
  "AWAITING_RECEIPT",
  "RECEIVED",
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
};

function isKnownStage(s: string): s is OrderStage {
  return Object.keys(STAGE_LABELS).includes(s);
}

/** Resolve display stage: backend may return null orderStage for legacy data → treat as NEW. */
function resolveStage(o: BoardOrder): OrderStage {
  const st = o.orderStage ?? o.status;
  if (st && isKnownStage(st)) return st;
  return "NEW";
}

export function OrdersKanban({
  onOpenOrder,
  filters,
}: {
  onOpenOrder: (id: string) => void;
  filters?: BoardFilters;
}) {
  const [list, setList] = useState<OrdersListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [dragging, setDragging] = useState<{ orderId: string; from: OrderStage } | null>(null);
  const [dragOver, setDragOver] = useState<OrderStage | null>(null);

  const columns: BoardColumn[] = useMemo(() => {
    const items = list?.items ?? [];
    const map: Record<OrderStage, BoardOrder[]> = {
      NEW: [],
      CONFIRMED: [],
      AWAITING_PAYMENT: [],
      AWAITING_STOCK: [],
      READY_TO_SHIP: [],
      SHIPPED: [],
      AWAITING_RECEIPT: [],
      RECEIVED: [],
      COMPLETED: [],
      CANCELED: [],
      REFUSED: [],
      RETURN_IN_PROGRESS: [],
    };
    for (const o of items) {
      const st = resolveStage(o);
      map[st].push(o);
    }
    return MAIN_STAGE_ORDER.map((st) => ({
      id: st,
      title: STAGE_LABELS[st],
      items: map[st],
    }));
  }, [list]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const params: Record<string, string> = {
        board: "true",
        withCompanyClient: "true",
        pageSize: "100",
      };
      if (filters?.orderStage) params.orderStage = filters.orderStage;
      if (filters?.status) params.status = filters.status;
      if (filters?.ownerId) params.ownerId = filters.ownerId;
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

      const res = await apiHttp.get<OrdersListResponse>("/orders", { params });
      setList(res.data ?? { items: [] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load board");
      setList(null);
    } finally {
      setLoading(false);
    }
  }, [
    filters?.amountFrom,
    filters?.amountTo,
    filters?.dateFrom,
    filters?.dateTo,
    filters?.hasTtn,
    filters?.orderStage,
    filters?.ownerId,
    filters?.paymentStatus,
    filters?.paymentType,
    filters?.q,
    filters?.sortBy,
    filters?.sortDir,
    filters?.status,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Phase 3: PATCH /orders/:id/stage with toStage. */
  const patchStage = useCallback(async (orderId: string, toStage: OrderStage, reason?: string) => {
    const res = await apiHttp.patch(`/orders/${orderId}/stage`, { toStage, reason });
    return res.data ?? null;
  }, []);

  const moveLocal = (orderId: string, to: OrderStage) => {
    setList((prev) => {
      if (!prev) return prev;
      const next = [...(prev.items ?? [])];
      const idx = next.findIndex((x) => x.id === orderId);
      if (idx === -1) return prev;
      next[idx] = { ...next[idx], orderStage: to };
      return { ...prev, items: next };
    });
  };

  const handleDrop = useCallback(
    async (orderId: string, to: OrderStage) => {
      const from = dragging?.from;
      if (from && from === to) {
        setDragging(null);
        return;
      }
      moveLocal(orderId, to);
      try {
        await patchStage(orderId, to, "Moved in board");
        if (["COMPLETED", "CANCELED", "REFUSED", "RETURN_IN_PROGRESS"].includes(to)) {
          void load();
        }
      } catch (error) {
        alert(error instanceof Error ? error.message : "Failed to move");
        void load();
      } finally {
        setDragging(null);
      }
    },
    [dragging, load, patchStage],
  );

  if (loading) return <div className="text-sm text-zinc-500">Loading board…</div>;
  if (err) return <div className="text-sm text-red-600">{err}</div>;
  if (!list) return null;

  const finalDropZones: { id: OrderStage; label: string; className: string }[] = [
    { id: "COMPLETED", label: "Завершено", className: "border-emerald-300 bg-emerald-50/80" },
    { id: "CANCELED", label: "Скасовано", className: "border-red-300 bg-red-50/80" },
    { id: "REFUSED", label: "Відмова", className: "border-orange-300 bg-orange-50/80" },
    { id: "RETURN_IN_PROGRESS", label: "Повернення", className: "border-amber-300 bg-amber-50/80" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-nowrap gap-4 overflow-x-auto pb-2">
        {columns.map((col) => {
          const st = col.id;
          const items = col.items ?? [];
          const isOver = dragOver === st;

          return (
            <div
              key={st}
              className={[
                "flex-shrink-0 w-[220px] min-w-[220px] rounded-lg border bg-zinc-50/80 transition-colors",
                isOver ? "border-zinc-900" : "border-zinc-200",
              ].join(" ")}
            >
              <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
                <div className="text-sm font-semibold text-zinc-900">{col.title}</div>
                <div className="text-xs text-zinc-500">{items.length}</div>
              </div>

              <div
                className={[
                  "min-h-[200px] space-y-3 p-3 transition-colors",
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
                {items.length === 0 ? (
                  <div className="text-xs text-zinc-500">Empty</div>
                ) : (
                  items.map((o) => {
                    const clientName =
                      o.client != null
                        ? `${o.client.lastName} ${o.client.firstName}`.trim() || "—"
                        : o.company?.name ?? "—";
                    const stage = resolveStage(o);
                    return (
                      <button
                        key={o.id}
                        type="button"
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
                          "w-full rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md",
                          dragging?.orderId === o.id ? "opacity-60" : "",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-zinc-900">{o.orderNumber}</span>
                          {o.paymentType && (
                            <span
                              className={[
                                "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                                o.paymentType === "PREPAYMENT"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-amber-100 text-amber-800",
                              ].join(" ")}
                            >
                              {o.paymentType === "PREPAYMENT" ? "Предопл." : "Отсрочка"}
                            </span>
                          )}
                        </div>
                        {o.createdAt && (
                          <div className="mt-1 text-xs text-zinc-500">
                            {formatRelativeTime(o.createdAt)}
                          </div>
                        )}
                        <div className="mt-2">
                          <StatusBadge variant="order" status={o.status} orderStage={o.orderStage} />
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
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {dragging && (
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
