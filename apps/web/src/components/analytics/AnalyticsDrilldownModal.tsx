"use client";

import { useEffect, useMemo, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { SimpleTable } from "@/components/analytics/SimpleTable";
import {
  ANALYTICS_DRILLDOWN_TITLES,
  buildDrilldownQuery,
  type AnalyticsDrilldownType,
} from "@/components/analytics/analytics.types";
import { formatMoneyUsd } from "@/components/analytics/useAnalyticsFilters";

type DrilldownResp = {
  period: { from: string; to: string };
  items: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
};

function formatDt(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("uk-UA", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function formatDateOnly(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("uk-UA");
  } catch {
    return iso;
  }
}

function tableForType(
  type: AnalyticsDrilldownType,
  items: Record<string, unknown>[],
): { columns: { key: string; label: string }[]; rows: Record<string, string | number | null>[] } {
  switch (type) {
    case "orders_period":
      return {
        columns: [
          { key: "orderNumber", label: "№" },
          { key: "orderStage", label: "Стадія" },
          { key: "bookedLine", label: "Booked" },
          { key: "ownerName", label: "Менеджер" },
          { key: "createdAt", label: "Створено" },
        ],
        rows: items.map((r) => {
          const owner = r.owner as { fullName?: string } | undefined;
          return {
            orderNumber: String(r.orderNumber ?? "—"),
            orderStage: String(r.orderStage ?? "—"),
            bookedLine: formatMoneyUsd(Number((r as { bookedLineUsd?: number }).bookedLineUsd ?? 0)),
            ownerName: owner?.fullName ?? "—",
            createdAt: formatDt(String(r.createdAt ?? "")),
          };
        }),
      };
    case "payments_period":
      return {
        columns: [
          { key: "orderNumber", label: "Замовлення" },
          { key: "amount", label: "Сума" },
          { key: "ownerName", label: "Менеджер" },
          { key: "paidAt", label: "Оплачено" },
        ],
        rows: items.map((r) => ({
          orderNumber: String(r.orderNumber ?? "—"),
          amount: formatMoneyUsd(Number((r as { amountUsd?: number }).amountUsd ?? 0)),
          ownerName: String(r.ownerName ?? "—"),
          paidAt: formatDt(String(r.paidAt ?? "")),
        })),
      };
    case "leads_period":
      return {
        columns: [
          { key: "name", label: "Ім'я" },
          { key: "status", label: "Статус" },
          { key: "source", label: "Джерело" },
          { key: "ownerName", label: "Відповідальний" },
          { key: "createdAt", label: "Створено" },
        ],
        rows: items.map((r) => ({
          name: String(r.name ?? "—"),
          status: String(r.status ?? "—"),
          source: String(r.source ?? "—"),
          ownerName: String(r.ownerName ?? "—"),
          createdAt: formatDt(String(r.createdAt ?? "")),
        })),
      };
    case "overdue_orders":
      return {
        columns: [
          { key: "orderNumber", label: "№" },
          { key: "clientName", label: "Клієнт" },
          { key: "debtAmount", label: "Борг" },
          { key: "paymentDueDate", label: "Термін" },
        ],
        rows: items.map((r) => ({
          orderNumber: String(r.orderNumber ?? "—"),
          clientName: String(r.clientName ?? "—"),
          debtAmount: formatMoneyUsd(Number((r as { debtAmountUsd?: number }).debtAmountUsd ?? 0)),
          paymentDueDate: formatDt(String(r.paymentDueDate ?? "")),
        })),
      };
    case "overdue_tasks":
      return {
        columns: [
          { key: "title", label: "Задача" },
          { key: "assigneeName", label: "Виконавець" },
          { key: "dueAt", label: "Термін" },
          { key: "orderId", label: "Замовлення" },
        ],
        rows: items.map((r) => ({
          title: String(r.title ?? "—"),
          assigneeName: String(r.assigneeName ?? "—"),
          dueAt: formatDt(String(r.dueAt ?? "")),
          orderId: r.orderId != null ? String(r.orderId) : "—",
        })),
      };
    default:
      return { columns: [], rows: [] };
  }
}

export function AnalyticsDrilldownModal({
  open,
  type,
  filterQuerySuffix,
  onClose,
}: {
  open: boolean;
  type: AnalyticsDrilldownType | null;
  filterQuerySuffix: string;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<DrilldownResp | null>(null);

  const title = type ? ANALYTICS_DRILLDOWN_TITLES[type] : "";

  useEffect(() => {
    if (!open || !type) return;
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "18e84e" },
      body: JSON.stringify({
        sessionId: "18e84e",
        runId: "run-1",
        hypothesisId: "H3",
        location: "AnalyticsDrilldownModal.tsx:openEffect",
        message: "Drilldown modal open effect",
        data: { open, type },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    setPage(1);
    setData(null);
    setErr(null);
  }, [open, type, filterQuerySuffix]);

  useEffect(() => {
    if (!open || !type) return;
    let c = false;
    setLoading(true);
    setErr(null);
    const qs = buildDrilldownQuery(filterQuerySuffix, type, page, pageSize);
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "18e84e" },
      body: JSON.stringify({
        sessionId: "18e84e",
        runId: "run-1",
        hypothesisId: "H4",
        location: "AnalyticsDrilldownModal.tsx:requestStart",
        message: "Drilldown request started",
        data: { type, page, qsLength: qs.length },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    apiHttp
      .get<DrilldownResp>(`/analytics/drilldown${qs}`)
      .then((r) => {
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "18e84e" },
          body: JSON.stringify({
            sessionId: "18e84e",
            runId: "run-1",
            hypothesisId: "H4",
            location: "AnalyticsDrilldownModal.tsx:requestSuccess",
            message: "Drilldown request success",
            data: { status: "ok", total: r.data?.total ?? null, itemsCount: r.data?.items?.length ?? 0 },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        if (!c) setData(r.data);
      })
      .catch((e) => {
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "18e84e" },
          body: JSON.stringify({
            sessionId: "18e84e",
            runId: "run-1",
            hypothesisId: "H5",
            location: "AnalyticsDrilldownModal.tsx:requestError",
            message: "Drilldown request failed",
            data: {
              httpStatus: e?.response?.status ?? null,
              message: e?.response?.data?.message ?? e?.message ?? "unknown",
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        if (!c) setErr(e?.response?.data?.message ?? "Не вдалося завантажити список");
      })
      .finally(() => {
        if (!c) setLoading(false);
      });
    return () => {
      c = true;
    };
  }, [open, type, filterQuerySuffix, page]);

  const { columns, rows } = useMemo(() => {
    if (!type || !data?.items) return { columns: [] as { key: string; label: string }[], rows: [] };
    return tableForType(
      type,
      data.items as Record<string, unknown>[],
    );
  }, [type, data]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !type) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-0 backdrop-blur-sm sm:items-center sm:px-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(90dvh,720px)] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
        aria-labelledby="analytics-drilldown-title"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id="analytics-drilldown-title" className="text-base font-semibold text-zinc-900">
              {title}
            </h2>
            {data?.period && (
              <p className="mt-0.5 truncate text-xs text-zinc-500">
                {formatDateOnly(data.period.from)} — {formatDateOnly(data.period.to)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
          >
            Закрити
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          {loading && <p className="text-sm text-zinc-500">Завантаження…</p>}
          {err && <p className="text-sm text-red-600">{err}</p>}
          {!loading && !err && (
            <>
              <SimpleTable columns={columns} rows={rows} />
              {data && data.total > 0 && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600">
                  <span>
                    Всього: {data.total} · сторінка {data.page} з {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="rounded-lg border border-zinc-200 px-3 py-1 font-medium disabled:opacity-40"
                    >
                      Назад
                    </button>
                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="rounded-lg border border-zinc-200 px-3 py-1 font-medium disabled:opacity-40"
                    >
                      Далі
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
