"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type OrderListItem = {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  currency?: string;
  createdAt: string;
};

type OrdersResponse =
  | { items: OrderListItem[]; total?: number; page?: number; pageSize?: number }
  | OrderListItem[];

export function EntityOrdersList({
  apiBaseUrl,
  query,
  onOpenOrder,
}: {
  apiBaseUrl: string;
  query: string; // например: "companyId=...&pageSize=50" или "clientId=...&pageSize=50"
  onOpenOrder: (orderId: string) => void;
}) {
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const url = useMemo(() => `${apiBaseUrl}/orders?${query}`, [apiBaseUrl, query]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(url, { cache: "no-store" });
      const t = await r.text();
      if (!r.ok) throw new Error(t || `Failed (${r.status})`);

      const data = JSON.parse(t) as OrdersResponse;
      const list = Array.isArray(data) ? data : data.items || [];
      setItems(list);
    } catch (e) {
      setItems([]);
      setErr(e instanceof Error ? e.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <div className="text-sm text-zinc-500">Loading orders…</div>;
  if (err) return <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">{err}</div>;
  if (items.length === 0) return <div className="text-sm text-zinc-500">No orders</div>;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-900">
        Orders ({items.length})
      </div>

      <div className="divide-y divide-zinc-200">
        {items.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onOpenOrder(o.id)}
            className="w-full px-4 py-3 text-left hover:bg-zinc-50"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-zinc-900">
                  {o.orderNumber}
                  <span className="ml-2 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-700">
                    {o.status}
                  </span>
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {new Date(o.createdAt).toLocaleString()}
                </div>
              </div>

              <div className="whitespace-nowrap text-sm text-zinc-900">
                {Number.isFinite(o.totalAmount) ? o.totalAmount.toFixed(2) : o.totalAmount}
                {o.currency ? <span className="ml-1 text-xs text-zinc-500">{o.currency}</span> : null}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}