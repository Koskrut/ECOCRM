"use client";

import { useEffect, useMemo, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { formatMoneyUsd } from "./analytics-ui";
import { formatDateTime } from "@/lib/crmDatetime";

type PaymentRow = {
  id: string;
  paidAt: string | null;
  amountUsd: number;
  currency: string;
  orderId: string;
  orderNumber: string;
  managerName: string | null;
  clientName: string | null;
};

type DrilldownResponse = {
  type: string;
  totalCount: number;
  totalUsd: number;
  items: PaymentRow[];
};

function pickErrorMessage(error: unknown, fallback: string): string {
  const err = error as { response?: { data?: { message?: string; error?: string } } };
  return (
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    (error instanceof Error ? error.message : fallback)
  );
}

function formatPaidAt(iso: string | null): string {
  return formatDateTime(iso, "—");
}

export function CollectedPaymentsDrilldownModal({
  open,
  onClose,
  querySuffix,
  kpiCollectedUsd,
}: {
  open: boolean;
  onClose: () => void;
  querySuffix: string;
  kpiCollectedUsd: number | undefined;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DrilldownResponse | null>(null);

  const url = useMemo(() => {
    const qs = querySuffix.startsWith("?") ? querySuffix.slice(1) : querySuffix;
    const params = new URLSearchParams(qs);
    params.set("type", "payments");
    return `/analytics/drilldown?${params.toString()}`;
  }, [querySuffix]);

  useEffect(() => {
    if (!open) return;
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
  }, [open, url]);

  if (!open) return null;

  const diff =
    kpiCollectedUsd != null && data != null
      ? Math.round((data.totalUsd - kpiCollectedUsd) * 100) / 100
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Закрити"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-zinc-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Зібрані оплати (деталізація)</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Ті самі правила, що й KPI: статус COMPLETED, дата{" "}
              <code className="text-xs">paidAt</code> у періоді, фільтр по власнику замовлення.
            </p>
            {data != null && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-700">
                <span>
                  Платежів у періоді: <strong>{data.totalCount}</strong>
                </span>
                <span>
                  Сума (USD) з drilldown: <strong>{formatMoneyUsd(data.totalUsd)}</strong>
                </span>
                {kpiCollectedUsd != null && (
                  <span>
                    KPI на Overview: <strong>{formatMoneyUsd(kpiCollectedUsd)}</strong>
                  </span>
                )}
                {diff != null && Math.abs(diff) > 0.01 && (
                  <span className="text-amber-700">
                    Різниця: {diff > 0 ? "+" : ""}
                    {formatMoneyUsd(diff)}
                  </span>
                )}
              </div>
            )}
            {data != null && data.totalCount > data.items.length && (
              <p className="mt-2 text-xs text-zinc-500">
                У таблиці показано перші {data.items.length} рядків (за датою оплати). Повна сума
                вгорі враховує всі платежі.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100"
          >
            Закрити
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {loading && <div className="text-sm text-zinc-500">Завантаження...</div>}
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          {!loading && !error && data && (
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-zinc-50 text-left text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Дата оплати</th>
                  <th className="px-3 py-2 font-medium">Замовлення</th>
                  <th className="px-3 py-2 font-medium">USD</th>
                  <th className="px-3 py-2 font-medium">Валюта</th>
                  <th className="px-3 py-2 font-medium">Менеджер</th>
                  <th className="px-3 py-2 font-medium">Клієнт</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                      Немає платежів за обраними фільтрами
                    </td>
                  </tr>
                ) : (
                  data.items.map((row) => (
                    <tr key={row.id} className="border-t border-zinc-100">
                      <td className="px-3 py-2 whitespace-nowrap">{formatPaidAt(row.paidAt)}</td>
                      <td className="px-3 py-2">{row.orderNumber}</td>
                      <td className="px-3 py-2 font-medium">{formatMoneyUsd(row.amountUsd)}</td>
                      <td className="px-3 py-2">{row.currency}</td>
                      <td className="px-3 py-2">{row.managerName ?? "—"}</td>
                      <td className="px-3 py-2">{row.clientName ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
