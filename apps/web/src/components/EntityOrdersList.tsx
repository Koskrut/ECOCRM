"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { formatOrderAmount } from "@/lib/formatOrderAmount";
import { isTextSelected } from "@/lib/dom";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTime } from "@/lib/crmDatetime";

type OrderListItem = {
  id: string;
  orderNumber: string;
  status?: string | null;
  orderStage?: string | null;
  totalAmount: number;
  paidAmount?: number | null;
  debtAmount?: number | null;
  paymentStatus?: "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERPAID" | string | null;
  isPaid?: boolean | null;
  currency?: string;
  exchangeRate?: number | null;
  createdAt: string;
};

type OrdersResponse =
  | { items: OrderListItem[]; total?: number; page?: number; pageSize?: number }
  | OrderListItem[];

function getErrMsg(e: unknown, fallback: string) {
  const anyErr = e as { response?: { data?: { message?: string; error?: string } } };
  return (
    anyErr?.response?.data?.message ||
    anyErr?.response?.data?.error ||
    (e instanceof Error ? e.message : fallback)
  );
}

function PaymentStatusBadge({
  status,
}: {
  status?: "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERPAID" | string | null;
}) {
  if (!status) return null;
  const cfg: Record<string, { label: string; cls: string }> = {
    UNPAID: { label: "Не оплачено", cls: "bg-zinc-100 text-zinc-700" },
    PARTIALLY_PAID: { label: "Частично", cls: "bg-amber-100 text-amber-800" },
    PAID: { label: "Оплачено", cls: "bg-emerald-100 text-emerald-800" },
    OVERPAID: { label: "Переплата", cls: "bg-sky-100 text-sky-800" },
  };
  const c = cfg[String(status)] ?? { label: String(status), cls: "bg-zinc-100 text-zinc-700" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c.cls}`}>
      {c.label}
    </span>
  );
}

export function EntityOrdersList({
  apiBaseUrl,
  query,
  onOpenOrder,
}: {
  apiBaseUrl: string;
  query: string;
  onOpenOrder: (orderId: string) => void;
}) {
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // apiHttp уже имеет baseURL "/api", поэтому путь без префикса
  const url = useMemo(() => `orders?${query}`, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiHttp.get<OrdersResponse>(url);
      const data = res.data;
      const list = Array.isArray(data) ? data : data?.items || [];
      setItems(list);
    } catch (e) {
      setItems([]);
      setErr(getErrMsg(e, "Failed to load orders"));
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
    <div className="rounded-lg border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-900">
        Orders ({items.length})
      </div>

      <div className="divide-y divide-zinc-200">
        {items.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => {
            if (isTextSelected()) return;
            onOpenOrder(o.id);
          }}
            className="w-full px-4 py-3 text-left hover:bg-zinc-50"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-900">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="min-w-0 truncate">{o.orderNumber}</span>
                    <span className="inline-flex flex-wrap items-center gap-1">
                      <StatusBadge
                        variant="order"
                        status={o.status ?? "—"}
                        orderStage={o.orderStage ?? null}
                      />
                      <PaymentStatusBadge status={o.paymentStatus} />
                    </span>
                  </div>
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {formatDateTime(o.createdAt)}
                </div>
              </div>

              <div className="whitespace-nowrap text-sm text-zinc-900">
                {formatOrderAmount(Number(o.totalAmount), o.currency ?? "UAH", o.exchangeRate)}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
