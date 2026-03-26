"use client";

import { useEffect, useMemo, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { formatMoneyUsd } from "@/app/analytics/analytics-ui";

type OrderRow = {
  id: string;
  createdAt: string;
  orderNumber: string;
  managerName: string | null;
  clientName: string | null;
  bookedRevenueUsd: number;
  debtAmountUsd: number;
};

type DrilldownResponse = {
  type: string;
  region?: string;
  totalCount: number;
  items: OrderRow[];
};

function pickErrorMessage(error: unknown, fallback: string): string {
  const err = error as { response?: { data?: { message?: string; error?: string } } };
  return (
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    (error instanceof Error ? error.message : fallback)
  );
}

export function MapRegionDrilldownModal({
  open,
  onClose,
  region,
  periodQuery,
}: {
  open: boolean;
  onClose: () => void;
  region: string | null;
  /** `?dateFrom=…&dateTo=…&period=custom&managerId=…` aligned with map backend window */
  periodQuery: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DrilldownResponse | null>(null);

  const url = useMemo(() => {
    const qs = periodQuery.startsWith("?") ? periodQuery.slice(1) : periodQuery;
    const params = new URLSearchParams(qs);
    params.set("type", "orders_region");
    if (region) params.set("region", region);
    return `/analytics/drilldown?${params.toString()}`;
  }, [periodQuery, region]);

  useEffect(() => {
    if (!open || !region) return;
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);
    apiHttp
      .get<DrilldownResponse>(url)
      .then((res) => {
        if (active) setData(res.data);
      })
      .catch((err) => {
        if (active) setError(pickErrorMessage(err, "Не вдалося завантажити"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, region, url]);

  if (!open || !region) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Закрити" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-zinc-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Замовлення за регіоном</h2>
            <p className="text-sm text-zinc-500">{region}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100"
          >
            Закрити
          </button>
        </div>
        <div className="min-h-[200px] overflow-auto p-4">
          {loading && <p className="text-sm text-zinc-500">Завантаження…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!loading && !error && data && (
            <>
              <p className="mb-3 text-sm text-zinc-600">
                Знайдено: <strong>{data.totalCount}</strong> (показано до {data.items.length})
              </p>
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 text-xs text-zinc-500">
                  <tr>
                    <th className="py-2 pr-2">№</th>
                    <th className="py-2 pr-2">Дата</th>
                    <th className="py-2 pr-2">Менеджер</th>
                    <th className="py-2 pr-2">Клієнт</th>
                    <th className="py-2 text-right">Booked</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row.id} className="border-b border-zinc-100">
                      <td className="py-2 pr-2 font-mono text-xs">{row.orderNumber}</td>
                      <td className="py-2 pr-2 text-zinc-600">
                        {new Date(row.createdAt).toLocaleDateString("uk-UA")}
                      </td>
                      <td className="py-2 pr-2">{row.managerName ?? "—"}</td>
                      <td className="py-2 pr-2">{row.clientName ?? "—"}</td>
                      <td className="py-2 text-right">{formatMoneyUsd(row.bookedRevenueUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
