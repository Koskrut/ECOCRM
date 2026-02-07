"use client";

import { useEffect, useMemo, useState } from "react";

type OrderStatus = "NEW" | "SHIPPING_CREATED" | "SHIPPED" | "DELIVERED" | "CANCELED";

type BoardOrder = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  totalAmount: number;
  currency: string;
  updatedAt: string;
  company?: { id: string; name: string } | null;
  client?: { id: string; firstName: string; lastName: string; phone: string } | null;
};

type BoardColumn = {
  id: OrderStatus;
  title: string;
  items: BoardOrder[];
};

type BoardResponse = {
  columns: BoardColumn[];
};

const STATUS_ORDER: OrderStatus[] = ["NEW", "SHIPPING_CREATED", "SHIPPED", "DELIVERED", "CANCELED"];

export function OrdersKanban({ onOpenOrder }: { onOpenOrder: (id: string) => void }) {
  const [data, setData] = useState<BoardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [dragging, setDragging] = useState<{ orderId: string; from: OrderStatus } | null>(null);
  const [dragOver, setDragOver] = useState<OrderStatus | null>(null);

  const columnsByStatus = useMemo(() => {
    const map: Record<OrderStatus, BoardOrder[]> = {
      NEW: [],
      SHIPPING_CREATED: [],
      SHIPPED: [],
      DELIVERED: [],
      CANCELED: [],
    };

    for (const c of data?.columns ?? []) {
      map[c.id] = c.items ?? [];
    }

    return map;
  }, [data]);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/orders/board`, { cache: "no-store" });
      const text = await r.text();
      if (!r.ok) throw new Error(text || `Failed (${r.status})`);
      setData(JSON.parse(text));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load board");
      setData(null);
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
    setData((prev) => {
      if (!prev) return prev;

      const map: Record<OrderStatus, BoardOrder[]> = {
        NEW: [],
        SHIPPING_CREATED: [],
        SHIPPED: [],
        DELIVERED: [],
        CANCELED: [],
      };

      for (const c of prev.columns ?? []) {
        map[c.id] = [...(c.items ?? [])];
      }

      let picked: BoardOrder | null = null;

      for (const st of STATUS_ORDER) {
        const next: BoardOrder[] = [];
        for (const it of map[st]) {
          if (it.id === orderId) picked = it;
          else next.push(it);
        }
        map[st] = next;
      }

      if (picked) {
        map[to] = [{ ...picked, status: to }, ...map[to]];
      }

      const nextColumns: BoardColumn[] = STATUS_ORDER.map((st) => ({
        id: st,
        title: st,
        items: map[st],
      }));

      return { columns: nextColumns };
    });
  };

  if (loading) return <div className="text-sm text-zinc-500">Loading board…</div>;
  if (err) return <div className="text-sm text-red-600">{err}</div>;
  if (!data) return null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      {STATUS_ORDER.map((st) => {
        const items = columnsByStatus[st] ?? [];
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
              <div className="text-sm font-semibold text-zinc-900">{st}</div>
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
                      setDragging({ orderId: o.id, from: o.status });
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
