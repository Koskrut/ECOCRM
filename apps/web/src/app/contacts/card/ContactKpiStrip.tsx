"use client";

import type { ContactCardSummary } from "./useContactCardSummary";
import { strings } from "@/locales";

const t = strings.contacts.card.kpi;

function fmtMoney(value: number): string {
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(value)} ₴`;
}

export function ContactKpiStrip({
  kpi,
  scopeNote,
}: {
  kpi: ContactCardSummary["kpi"];
  scopeNote: string | null;
}) {
  const primaryCards = [
    { title: t.revenue, value: fmtMoney(kpi.revenue) },
    { title: t.debt, value: fmtMoney(kpi.debt) },
    ...(kpi.overdue > 0 ? [{ title: t.overdue, value: fmtMoney(kpi.overdue) }] : []),
    ...(kpi.orderCredit > 0 ? [{ title: t.orderCredit, value: fmtMoney(kpi.orderCredit) }] : []),
    ...(kpi.clientBalance > 0
      ? [{ title: t.clientBalance, value: fmtMoney(kpi.clientBalance) }]
      : []),
    { title: t.orders, value: String(kpi.ordersCount) },
    { title: t.openTasks, value: String(kpi.openTasksCount) },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        {primaryCards.map((card) => (
          <div key={card.title} className="rounded-md border border-zinc-200 bg-white px-2.5 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              {card.title}
            </div>
            <div className="mt-0.5 text-base font-semibold leading-tight text-zinc-900">
              {card.value}
            </div>
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
