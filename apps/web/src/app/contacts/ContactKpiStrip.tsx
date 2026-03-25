"use client";

import type { ContactCardPayload } from "./contact-card.types";

export type { ContactCardPayload } from "./contact-card.types";

/** Нові рядки карточки v2 — українська (план §28.10). */

function formatMoney(n: number): string {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("uk-UA", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

export function ContactKpiStrip({
  data,
  loading,
}: {
  data: ContactCardPayload | null;
  loading: boolean;
}) {
  if (loading && !data) {
    return (
      <div className="mb-3 border-b border-zinc-100 pb-3">
        <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-14 w-[8.5rem] shrink-0 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100 sm:min-w-[7rem] sm:flex-1"
            />
          ))}
        </div>
      </div>
    );
  }
  if (!data) return null;

  const { kpi, kpiAccess, legacyLinkedOrders, companyOrders } = data;
  const chips: { label: string; value: string }[] = [
    { label: "Угоди", value: String(kpi.orderCount) },
    { label: "Оборот", value: formatMoney(kpi.totalRevenue) },
    { label: "Борг", value: formatMoney(kpi.totalDebt) },
    { label: "Прострочено", value: formatMoney(kpi.overdueDebt) },
    { label: "Сер. чек", value: formatMoney(kpi.averageOrderValue) },
    { label: "Останнє замовлення", value: formatShortDate(kpi.lastOrderAt) },
    { label: "Активність", value: formatShortDate(kpi.lastActivityAt) },
  ];

  return (
    <div className="mb-0 border-b border-zinc-100 pb-3">
      {kpiAccess.showPartialDataNotice ? (
        <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {kpiAccess.partialDataNotice}
        </p>
      ) : null}
      <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap">
        {chips.map((c) => (
          <div
            key={c.label}
            className="w-[8.75rem] shrink-0 snap-start rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2 sm:min-w-[6.5rem] sm:flex-1 sm:px-2.5 sm:py-1.5"
          >
            <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{c.label}</div>
            <div className="truncate text-sm font-semibold text-zinc-900">{c.value}</div>
          </div>
        ))}
      </div>
      {(legacyLinkedOrders.total > 0 || companyOrders.total > 0) && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-600">
          {legacyLinkedOrders.total > 0 ? (
            <span>
              Замовлення лише за ТТН (legacy): <strong>{legacyLinkedOrders.total}</strong>
            </span>
          ) : null}
          {companyOrders.total > 0 ? (
            <span>
              Замовлення компанії: <strong>{companyOrders.total}</strong>
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
