"use client";

import { useEffect, useMemo, useState } from "react";

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

    return STATUS_ORDER.map((st) => ({
      id: st,
      title: STATUS_LABELS[st],
      items: map[st],
    }));
  }, [list]);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/orders/board`, { cache: "no-store" });
      const text = await r.text();
      if (!r.ok) throw new Error(text || `Failed (${r.status})`);
      setList(text ? (JSON.parse(text) as OrdersListResponse) : { items: [] });
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
    const r = await fetch(`/api/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reason }),
    });

    const text = await r.text();
    if (!r.ok) throw new Error(text || `Failed (${r.status})`);
    return text ? JSON.parse(text) : null;
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

  if (loading) return <div className="text-sm text-zinc-500">Loading board…</div>;
  if (err) return <div className="text-sm text-red-600">{err}</div>;
  if (!list) return null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-8">
      {columns.map((col) => {
        const st = col.id;
        const items = col.items ?? [];
        const isOver = dragOver === st;

        return (
          <div
            key={st}
            className={[
              "rounded-lg border bg-white shadow-sm transition-colors",
              isOver ? "border-zinc-900" : "border-zinc-200",
            ].join(" ")}
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
              <div className="text-sm font-semibold text-zinc-900">{col.title}</div>
              <div className="text-xs text-zinc-500">{items.length}</div>
            </div>

            <div
              className={[
                "min-h-[140px] space-y-3 p-3 transition-colors",
                isOver ? "bg-zinc-50" : "",
              ].join(" ")}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOver(st);
              }}
              onDragLeave={() => setDragOver((cur) => (cur === st ? null : cur))}
              onDrop={async (e) => {
                e.preventDefault();
                setDragOver(null);

                const orderId = e.dataTransfer.getData("text/plain") || dragging?.orderId;
                if (!orderId) return;

                const to = st;
                const from = dragging?.from;

                if (from && from === to) {
                  setDragging(null);
                  return;
                }

                moveLocal(orderId, to);

                try {
                  await patchStatus(orderId, to, "Moved in board");
                } catch (error) {
                  alert(error instanceof Error ? error.message : "Failed to move");
                  await load();
                } finally {
                  setDragging(null);
                }
              }}
            >
              {items.length === 0 ? (
                <div className="text-xs text-zinc-500">Empty</div>
              ) : (
                items.map((o) => (
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
                    onDragEnd={() => {
                      setDragging(null);
                      setDragOver(null);
                    }}
                    className={[
                      "w-full rounded-md border border-zinc-200 p-3 text-left hover:bg-zinc-50",
                      dragging?.orderId === o.id ? "opacity-60" : "",
                    ].join(" ")}
                  >
                    <div className="text-sm font-medium text-zinc-900">{o.orderNumber}</div>
                    <div className="mt-1 text-xs text-zinc-600">
                      {o.company?.name ?? "—"} ·{" "}
                      {o.client ? `${o.client.firstName} ${o.client.lastName}` : "—"}
                    </div>
                    <div className="mt-2 text-xs text-zinc-700">
                      {o.totalAmount} {o.currency}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
