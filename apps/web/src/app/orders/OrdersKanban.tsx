"use client";

import { apiHttp } from "../../lib/api/client";
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

type OrderStatus =
  | "NEW"
  | "IN_WORK"
  | "READY_TO_SHIP"
  | "SHIPPED"
  | "CONTROL_PAYMENT"
  | "SUCCESS"
  | "RETURNING"
  | "CANCELED";

type BoardOrder = {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  currency: string;
  paymentType?: string | null;
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
  id: OrderStatus;
  title: string;
  items: BoardOrder[];
};

const STATUS_ORDER: OrderStatus[] = [
  "NEW",
  "IN_WORK",
  "READY_TO_SHIP",
  "SHIPPED",
  "CONTROL_PAYMENT",
  "SUCCESS",
  "RETURNING",
  "CANCELED",
];

/** Only active statuses shown on the board; closed/failed are excluded. */
const BOARD_STATUS_ORDER: OrderStatus[] = [
  "NEW",
  "IN_WORK",
  "READY_TO_SHIP",
  "SHIPPED",
  "CONTROL_PAYMENT",
];

const STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: "NEW",
  IN_WORK: "IN_WORK",
  READY_TO_SHIP: "READY_TO_SHIP",
  SHIPPED: "SHIPPED",
  CONTROL_PAYMENT: "CONTROL_PAYMENT",
  SUCCESS: "SUCCESS",
  RETURNING: "RETURNING",
  CANCELED: "CANCELED",
};

function isKnownStatus(s: string): s is OrderStatus {
  return (STATUS_ORDER as string[]).includes(s);
}

export function OrdersKanban({ onOpenOrder }: { onOpenOrder: (id: string) => void }) {
  const [list, setList] = useState<OrdersListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [dragging, setDragging] = useState<{ orderId: string; from: OrderStatus } | null>(null);
  const [dragOver, setDragOver] = useState<OrderStatus | null>(null);

  const columns: BoardColumn[] = useMemo(() => {
    const items = list?.items ?? [];

    const map: Record<OrderStatus, BoardOrder[]> = {
      NEW: [],
      IN_WORK: [],
      READY_TO_SHIP: [],
      SHIPPED: [],
      CONTROL_PAYMENT: [],
      SUCCESS: [],
      RETURNING: [],
      CANCELED: [],
    };

    for (const o of items) {
      const st = String(o.status ?? "");
      if (isKnownStatus(st)) map[st].push(o);
      else map.NEW.push({ ...o, status: "NEW" }); // чтобы ничего не терялось
    }

    return BOARD_STATUS_ORDER.map((st) => ({
      id: st,
      title: STATUS_LABELS[st],
      items: map[st],
    }));
  }, [list]);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiHttp.get<OrdersListResponse>("/orders/board");
      setList(res.data ?? { items: [] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load board");
      setList(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const patchStatus = async (orderId: string, status: OrderStatus, reason?: string) => {
    const res = await apiHttp.patch(`/orders/${orderId}/status`, { status, reason });
    return res.data ?? null;
  };

  const moveLocal = (orderId: string, to: OrderStatus) => {
    setList((prev) => {
      if (!prev) return prev;
      const next = [...(prev.items ?? [])];
      const idx = next.findIndex((x) => x.id === orderId);
      if (idx === -1) return prev;
      next[idx] = { ...next[idx], status: to };
      return { ...prev, items: next };
    });
  };

  const handleDrop = useCallback(
    async (orderId: string, to: OrderStatus) => {
      const from = dragging?.from;
      if (from && from === to) {
        setDragging(null);
        return;
      }
      moveLocal(orderId, to);
      try {
        await patchStatus(orderId, to, "Moved in board");
        if (to === "SUCCESS" || to === "CANCELED" || to === "RETURNING") {
          void load();
        }
      } catch (error) {
        alert(error instanceof Error ? error.message : "Failed to move");
        void load();
      } finally {
        setDragging(null);
      }
    },
    [dragging],
  );

  if (loading) return <div className="text-sm text-zinc-500">Loading board…</div>;
  if (err) return <div className="text-sm text-red-600">{err}</div>;
  if (!list) return null;

  const finalDropZones: { id: OrderStatus; label: string; className: string }[] = [
    { id: "SUCCESS", label: "Успешная", className: "border-emerald-300 bg-emerald-50/80" },
    { id: "CANCELED", label: "Проваленная", className: "border-red-300 bg-red-50/80" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      {columns.map((col) => {
        const st = col.id;
        const items = col.items ?? [];
        const isOver = dragOver === st;

        return (
          <div
            key={st}
            className={[
              "rounded-lg border bg-zinc-50/80 transition-colors",
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
                      ? `${o.client.firstName} ${o.client.lastName}`.trim() || "—"
                      : o.company?.name ?? "—";
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => onOpenOrder(o.id)}
                      draggable
                      onDragStart={(e) => {
                        const st0 = isKnownStatus(String(o.status))
                          ? (String(o.status) as OrderStatus)
                          : "NEW";
                        setDragging({ orderId: o.id, from: st0 });
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
                        <StatusBadge variant="order" status={o.status} />
                      </div>
                      <div className="mt-3 text-[10px] font-medium uppercase text-zinc-500">
                        Сума
                      </div>
                      <div className="text-sm font-medium text-zinc-900">
                        {o.totalAmount} {o.currency}
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
