"use client";

import type { ContactCardSummary } from "./useContactCardSummary";

function fmtMoney(value: number): string {
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(value);
}

export function ContactKpiStrip({ kpi, scopeNote }: { kpi: ContactCardSummary["kpi"]; scopeNote: string | null }) {
  const primaryCards = [
    { title: "Revenue $", value: fmtMoney(kpi.revenue) },
    { title: "Debt $", value: fmtMoney(kpi.debt) },
    ...(kpi.clientBalance > 0
      ? [{ title: "Credit balance", value: fmtMoney(kpi.clientBalance) }]
      : []),
    { title: "Orders", value: String(kpi.ordersCount) },
    { title: "Open tasks", value: String(kpi.openTasksCount) },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {primaryCards.map((card) => (
          <div key={card.title} className="rounded-md border border-zinc-200 bg-white px-2.5 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{card.title}</div>
            <div className="mt-0.5 text-base font-semibold leading-tight text-zinc-900">{card.value}</div>
          </div>
        ))}
      </div>
      {scopeNote ? (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-600">
          {scopeNote}
        </div>
      ) : null}
    </div>
  );
}

