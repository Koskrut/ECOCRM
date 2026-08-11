"use client";

import type { ContactCardSummary } from "./useContactCardSummary";
import { strings } from "@/locales";

const t = strings.contacts.card.kpi;

function fmtMoney(value: number): string {
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(value)} ₴`;
}

type KpiCardVariant = "default" | "amber" | "risk";

function kpiCardClass(variant: KpiCardVariant): string {
  switch (variant) {
    case "risk":
      return "border-red-200 bg-red-50";
    case "amber":
      return "border-amber-200 bg-amber-50";
    default:
      return "border-zinc-200 bg-white";
  }
}

function kpiValueClass(variant: KpiCardVariant): string {
  switch (variant) {
    case "risk":
      return "text-red-800";
    case "amber":
      return "text-amber-900";
    default:
      return "text-zinc-900";
  }
}

export function ContactKpiStrip({
  kpi,
  scopeNote,
}: {
  kpi: ContactCardSummary["kpi"];
  scopeNote: string | null;
}) {
  const hasOverdue = kpi.overdue > 0;
  const hasDebt = kpi.debt > 0;

  const primaryCards: Array<{ title: string; value: string; variant: KpiCardVariant }> = [
    { title: t.revenue, value: fmtMoney(kpi.revenue), variant: "default" },
    ...(hasDebt
      ? [
          {
            title: t.debt,
            value: fmtMoney(kpi.debt),
            variant: hasOverdue ? ("risk" as const) : ("amber" as const),
          },
        ]
      : []),
    ...(kpi.orderCredit > 0
      ? [{ title: t.orderCredit, value: fmtMoney(kpi.orderCredit), variant: "default" as const }]
      : []),
    ...(kpi.clientBalance > 0
      ? [{ title: t.clientBalance, value: fmtMoney(kpi.clientBalance), variant: "default" as const }]
      : []),
    { title: t.orders, value: String(kpi.ordersCount), variant: "default" },
    { title: t.openTasks, value: String(kpi.openTasksCount), variant: "default" },
  ];

  return (
    <div className="space-y-2">
      {hasOverdue ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
          <div className="font-semibold">{t.overdueAlertTitle}</div>
          <div className="mt-1 space-y-0.5 tabular-nums">
            <div>
              {t.overdueAmount}:{" "}
              <span className="font-semibold">{fmtMoney(kpi.overdue)}</span>
            </div>
            {hasDebt ? (
              <div>
                {t.clientTotalDebt}:{" "}
                <span className="font-semibold">{fmtMoney(kpi.debt)}</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        {primaryCards.map((card) => (
          <div
            key={card.title}
            className={`rounded-md border px-2.5 py-2 ${kpiCardClass(card.variant)}`}
          >
            <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              {card.title}
            </div>
            <div
              className={`mt-0.5 text-base font-semibold leading-tight ${kpiValueClass(card.variant)}`}
            >
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
