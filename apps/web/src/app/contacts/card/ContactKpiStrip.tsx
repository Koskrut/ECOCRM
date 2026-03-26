"use client";

import type { ContactCardSummary } from "./useContactCardSummary";

function fmtDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function fmtMoney(value: number): string {
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(value);
}

export function ContactKpiStrip({ kpi, scopeNote }: { kpi: ContactCardSummary["kpi"]; scopeNote: string | null }) {
  const cards = [
    { title: "Orders", value: String(kpi.ordersCount) },
    { title: "Revenue", value: `${fmtMoney(kpi.revenue)} USD` },
    { title: "Debt", value: `${fmtMoney(kpi.debt)} USD` },
    { title: "Overdue", value: `${fmtMoney(kpi.overdue)} USD` },
    { title: "Last activity", value: fmtDate(kpi.lastActivityAt) },
    { title: "Last order", value: fmtDate(kpi.lastOrderAt) },
    { title: "Open tasks", value: String(kpi.openTasksCount) },
    { title: "Overdue tasks", value: String(kpi.overdueTasksCount) },
  ];

  return (
    <div className="space-y-2.5">
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.title} className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{card.title}</div>
            <div className="mt-1 text-base font-semibold text-zinc-900">{card.value}</div>
          </div>
        ))}
      </div>
      {scopeNote ? (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-600">
          {scopeNote}
        </div>
      ) : null}
    </div>
  );
}

