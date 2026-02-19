"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type OrderItem = {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
  comment?: string | null;
  client?: { id: string; firstName: string; lastName: string; phone: string };
};

type OrdersResponse = {
  items: OrderItem[];
  total: number;
  page: number;
  pageSize: number;
};

type Props = {
  apiBaseUrl: string;
  companyId: string;
  onOpenOrder: (orderId: string) => void;
};

export function CompanyOrders({ apiBaseUrl, companyId, onOpenOrder }: Props) {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const url = useMemo(
    () => `${apiBaseUrl}/orders?companyId=${companyId}&page=1&pageSize=50`,
    [apiBaseUrl, companyId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(url, { cache: "no-store" });
      const t = await r.text();
      if (!r.ok) throw new Error(t || `Failed (${r.status})`);
      const data = JSON.parse(t) as OrdersResponse;
      setItems(data.items || []);
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
  if (err)
    return (
      <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">
        {err}
      </div>
    );
  if (items.length === 0) return <div className="text-sm text-zinc-500">No orders</div>;

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200">
      <table className="w-full">
        <thead className="border-b border-zinc-200 bg-zinc-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-700">
              Order
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-700">
              Status
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-700">
              Client
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-700">
              Total
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-700">
              Created
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 bg-white">
          {items.map((o) => (
            <tr
              key={o.id}
              onClick={() => onOpenOrder(o.id)}
              className="cursor-pointer hover:bg-zinc-50"
            >
              <td className="px-4 py-3 text-sm font-medium text-zinc-900">{o.orderNumber}</td>
              <td className="px-4 py-3 text-sm text-zinc-700">{o.status}</td>
              <td className="px-4 py-3 text-sm text-zinc-700">
                {o.client ? `${o.client.firstName} ${o.client.lastName}` : "—"}
              </td>
              <td className="px-4 py-3 text-sm text-zinc-700">
                {o.totalAmount} {o.currency}
              </td>
              <td className="px-4 py-3 text-sm text-zinc-600">
                {new Date(o.createdAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
