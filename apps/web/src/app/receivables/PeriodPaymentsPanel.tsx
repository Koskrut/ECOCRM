"use client";

import { formatDate } from "@/lib/crmDatetime";
import { strings } from "@/locales";
import type { PeriodPaymentRow } from "@/lib/api/resources/receivables";
import { formatMoney } from "./format-money";

export function PeriodPaymentsPanel({
  paidFrom,
  paidTo,
  items,
  total,
  currency,
  loadedTotalBase,
  loadingMore,
  hasMore,
  onChangePaidFrom,
  onChangePaidTo,
  onLoadMore,
}: {
  paidFrom: string;
  paidTo: string;
  items: PeriodPaymentRow[];
  total: number;
  currency: string;
  loadedTotalBase: number;
  loadingMore?: boolean;
  hasMore?: boolean;
  onChangePaidFrom: (ymd: string) => void;
  onChangePaidTo: (ymd: string) => void;
  onLoadMore?: () => void;
}) {
  const t = strings.receivables;
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500">{t.periodPaymentsFrom}</label>
          <input
            type="date"
            value={paidFrom}
            onChange={(e) => onChangePaidFrom(e.target.value)}
            className="mt-1 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">{t.periodPaymentsTo}</label>
          <input
            type="date"
            value={paidTo}
            onChange={(e) => onChangePaidTo(e.target.value)}
            className="mt-1 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
          />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900">{t.periodPaymentsTitle}</h3>
        {items.length > 0 ? (
          <div className="text-xs text-zinc-500">
            {t.showingOf(items.length, total)}
            {" · "}
            {t.periodPaymentsTotal(formatMoney(loadedTotalBase, currency))}
          </div>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">{t.noPeriodPayments}</p>
      ) : (
        <>
          <ul className="mt-2 divide-y divide-zinc-100 text-sm">
            {items.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="text-zinc-500">{formatDate(p.paidAt.slice(0, 10))}</span>
                <span className="font-medium tabular-nums">
                  {p.amount.toFixed(2)} {p.currency}
                </span>
                {p.amountUsd != null ? (
                  <span className="text-xs text-zinc-400 tabular-nums">
                    ≈ {formatMoney(p.amountUsd, currency)}
                  </span>
                ) : null}
                <span className="text-zinc-600">{p.clientName ?? "—"}</span>
                <span className="text-zinc-500">{p.orderNumber ?? "—"}</span>
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">
                  {p.sourceType}
                </span>
              </li>
            ))}
          </ul>
          {hasMore && onLoadMore ? (
            <button
              type="button"
              disabled={loadingMore}
              onClick={onLoadMore}
              className="mt-3 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {loadingMore ? t.updating : t.loadMore}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
