"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiHttp } from "../../lib/api/client";
import { formatOrderAmount } from "@/lib/formatOrderAmount";
import { isTextSelected } from "@/lib/dom";
import { formatDate } from "@/lib/crmDatetime";

/** Phase 5: Returns kanban — columns by ReturnStatus, drag-and-drop to change status (validated on backend). */

type ReturnStatus =
  | "REQUESTED"
  | "APPROVED"
  | "IN_TRANSIT_BACK"
  | "RECEIVED_BY_WAREHOUSE"
  | "INSPECTION"
  | "REFUND_OR_ADJUSTMENT"
  | "CLOSED";

type ReturnOrder = {
  id: string;
  orderNumber: string;
  orderStage?: string | null;
  totalAmount?: number;
  debtAmount?: number;
  paidAmount?: number;
  currency?: string;
  exchangeRate?: number | null;
  company?: { id: string; name: string } | null;
  client?: { id: string; firstName: string; lastName: string } | null;
};

type ReturnItem = {
  id: string;
  orderItemId: string;
  qtyReturned: number;
  orderItem?: { id: string; qty: number; price: number; lineTotal: number; productNameSnapshot?: string | null };
};

type ReturnCard = {
  id: string;
  orderId?: string;
  status: ReturnStatus;
  requestedAt: string;
  closedAt?: string | null;
  createdAt: string;
  order: ReturnOrder & { id?: string };
  items: ReturnItem[];
};

type ReturnsListResponse = {
  items: ReturnCard[];
  total?: number;
  page?: number;
  pageSize?: number;
};

const COLUMN_ORDER: ReturnStatus[] = [
  "REQUESTED",
  "APPROVED",
  "IN_TRANSIT_BACK",
  "RECEIVED_BY_WAREHOUSE",
  "INSPECTION",
  "REFUND_OR_ADJUSTMENT",
  "CLOSED",
];

const STATUS_LABELS: Record<ReturnStatus, string> = {
  REQUESTED: "Заявлено",
  APPROVED: "Погоджено",
  IN_TRANSIT_BACK: "В дорозі назад",
  RECEIVED_BY_WAREHOUSE: "Прийнято на склад",
  INSPECTION: "Перевірка",
  REFUND_OR_ADJUSTMENT: "Повернення коштів",
  CLOSED: "Закрито",
};

function isKnownStatus(s: string): s is ReturnStatus {
  return COLUMN_ORDER.includes(s as ReturnStatus);
}

export function ReturnsKanban({
  onOpenOrder,
  onOpenReturn,
  refreshKey = 0,
}: {
  onOpenOrder: (orderId: string) => void;
  onOpenReturn?: (returnId: string) => void;
  /** Increment to force refetch (e.g. after creating a return from order modal). */
  refreshKey?: number;
}) {
  const [list, setList] = useState<ReturnsListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ returnId: string; from: ReturnStatus } | null>(null);
  const [dragOver, setDragOver] = useState<ReturnStatus | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiHttp.get<ReturnsListResponse>("/order-returns", {
        params: { pageSize: 100 },
      });
      setList(res.data ?? { items: [] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load returns");
      setList(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const patchStatus = useCallback(async (returnId: string, status: ReturnStatus) => {
    await apiHttp.patch(`/order-returns/${returnId}/status`, { status });
  }, []);

  const columns = useMemo(() => {
    const items = list?.items ?? [];
    const map: Record<ReturnStatus, ReturnCard[]> = {
      REQUESTED: [],
      APPROVED: [],
      IN_TRANSIT_BACK: [],
      RECEIVED_BY_WAREHOUSE: [],
      INSPECTION: [],
      REFUND_OR_ADJUSTMENT: [],
      CLOSED: [],
    };
    for (const r of items) {
      const st = isKnownStatus(r.status) ? r.status : "REQUESTED";
      map[st].push(r);
    }
    return COLUMN_ORDER.map((id) => ({
      id,
      title: STATUS_LABELS[id],
      items: map[id],
    }));
  }, [list]);

  const handleDrop = useCallback(
    async (returnId: string, to: ReturnStatus) => {
      const from = dragging?.from;
      if (from === to) {
        setDragging(null);
        return;
      }
      setList((prev) => {
        if (!prev) return prev;
        const next = prev.items.map((r) =>
          r.id === returnId ? { ...r, status: to } : r,
        );
        return { ...prev, items: next };
      });
      try {
        await patchStatus(returnId, to);
        void load();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Failed to update status");
        void load();
      } finally {
        setDragging(null);
      }
    },
    [dragging, load, patchStatus],
  );

  if (loading) return <div className="text-sm text-zinc-500">Завантаження повернень…</div>;
  if (err) return <div className="text-sm text-red-600">{err}</div>;
  if (!list) return null;

  const totalUnits = (r: ReturnCard) =>
    r.items.reduce((s, i) => s + (i.qtyReturned ?? 0), 0);

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        Канбан повернень. Перетягування змінює статус (переходи валідуються на сервері).
      </p>
      <div className="flex flex-nowrap gap-4 overflow-x-auto pb-2">
        {columns.map((col) => (
          <div
            key={col.id}
            className={`flex-shrink-0 w-[220px] min-w-[220px] rounded-lg border bg-zinc-50/80 ${
              dragOver === col.id ? "border-zinc-900" : "border-zinc-200"
            }`}
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
              <div className="text-sm font-semibold text-zinc-900">{col.title}</div>
              <div className="text-xs text-zinc-500">{col.items.length}</div>
            </div>
            <div
              className="min-h-[160px] space-y-3 p-3"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOver(col.id);
              }}
              onDragLeave={() => setDragOver((c) => (c === col.id ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const id = e.dataTransfer.getData("text/plain") || dragging?.returnId;
                if (id) void handleDrop(id, col.id);
              }}
            >
              {col.items.length === 0 ? (
                <div className="text-xs text-zinc-500">—</div>
              ) : (
                col.items.map((r) => {
                  const clientName = r.order.client
                    ? `${r.order.client.lastName ?? ""} ${r.order.client.firstName ?? ""}`.trim() || "—"
                    : r.order.company?.name ?? "—";
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        if (isTextSelected()) return;
                        const oid = r.orderId ?? r.order?.id;
                        if (!oid) return;
                        if (onOpenReturn) {
                          onOpenReturn(r.id);
                        } else {
                          onOpenOrder(oid);
                        }
                      }}
                      draggable
                      onDragStart={(e) => {
                        setDragging({ returnId: r.id, from: r.status });
                        e.dataTransfer.setData("text/plain", r.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => setDragging(null)}
                      className={`w-full rounded-xl border border-zinc-200 bg-white p-3 text-left shadow-sm hover:shadow-md ${
                        dragging?.returnId === r.id ? "opacity-60" : ""
                      }`}
                    >
                      <div className="font-medium text-zinc-900">{r.order.orderNumber}</div>
                      <div className="mt-0.5 text-xs text-zinc-500">{clientName}</div>
                      <div className="mt-1.5 text-xs text-zinc-500">
                        {formatDate(r.requestedAt)} · {r.items.length} поз. · {totalUnits(r)} од.
                      </div>
                      {r.order.debtAmount != null && (
                        <div className="mt-1 text-xs text-amber-700">
                          Борг: {formatOrderAmount(r.order.debtAmount, r.order.currency ?? "UAH", r.order.exchangeRate)}
                        </div>
                      )}
                      <div className="mt-1 text-xs text-zinc-400">
                        Заказ: {r.order.orderStage ?? "—"}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
