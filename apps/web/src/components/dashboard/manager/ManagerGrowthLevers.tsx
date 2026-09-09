"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Flame } from "lucide-react";
import { formatMoneyBase, formatNumber, formatPercent } from "@/app/analytics/analytics-ui";
import type { ManagerGrowthLever } from "@/lib/api/resources/dashboard";
import type { BaseCurrency } from "@/lib/base-currency";
import { strings } from "@/locales";

type Props = {
  levers: ManagerGrowthLever[];
  currency: BaseCurrency;
  financeEnabled?: boolean;
};

const STATUS_STYLES = {
  critical: {
    border: "border-red-200",
    badge: "bg-red-50 text-red-700",
    bar: "bg-red-500",
    icon: Flame,
  },
  watch: {
    border: "border-amber-200",
    badge: "bg-amber-50 text-amber-800",
    bar: "bg-amber-500",
    icon: AlertTriangle,
  },
  good: {
    border: "border-emerald-200",
    badge: "bg-emerald-50 text-emerald-700",
    bar: "bg-emerald-500",
    icon: CheckCircle2,
  },
} as const;

const FINANCE_LEVER_KEYS = new Set(["collection"]);

function formatLeverValue(lever: ManagerGrowthLever, currency: BaseCurrency): string {
  switch (lever.unit) {
    case "money":
      return formatMoneyBase(lever.currentValue, currency);
    case "percent":
    case "ratio":
      return formatPercent(lever.currentValue);
    default:
      return formatNumber(lever.currentValue);
  }
}

function formatCompare(lever: ManagerGrowthLever, currency: BaseCurrency): string | null {
  if (lever.compareValue == null) return null;
  switch (lever.unit) {
    case "money":
      return formatMoneyBase(lever.compareValue, currency);
    case "percent":
    case "ratio":
      return formatPercent(lever.compareValue);
    default:
      return formatNumber(lever.compareValue);
  }
}

export function ManagerGrowthLevers({ levers, currency, financeEnabled = true }: Props) {
  const t = strings.dashboard.manager.growthLevers;
  const hiddenFinance = !financeEnabled
    ? levers.filter((l) => FINANCE_LEVER_KEYS.has(l.key) && l.status !== "good")
    : [];
  const visible = levers.filter((l) => financeEnabled || !FINANCE_LEVER_KEYS.has(l.key));
  const actionable = visible.filter((l) => l.status !== "good");

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">{t.title}</h2>
        <p className="mt-1 text-sm text-zinc-500">{t.subtitle}</p>
      </div>

      {actionable.length === 0 ? (
        <div className="mt-4 space-y-2">
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {t.empty}
          </p>
          {hiddenFinance.length > 0 ? (
            <p className="text-xs text-zinc-500">{t.financeHidden}</p>
          ) : null}
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {actionable.slice(0, 5).map((lever) => {
            const style = STATUS_STYLES[lever.status];
            const Icon = style.icon;
            const label = t.keys[lever.key as keyof typeof t.keys] ?? lever.key;
            const compare = formatCompare(lever, currency);
            return (
              <li key={lever.key}>
                <Link
                  href={lever.href}
                  className={`flex items-center gap-3 rounded-xl border ${style.border} bg-white px-3 py-3 transition hover:shadow-sm`}
                >
                  <span className={`h-10 w-1 shrink-0 rounded-full ${style.bar}`} aria-hidden />
                  <span
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${style.badge}`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-zinc-900">{label}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.badge}`}
                      >
                        {t.status[lever.status]}
                      </span>
                    </div>
                    <div className="mt-0.5 text-sm tabular-nums text-zinc-600">
                      {formatLeverValue(lever, currency)}
                      {compare ? (
                        <span className="text-zinc-400">
                          {" "}
                          · {t.vsCompare.replace("{value}", compare)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-sky-700">
                    {t.action}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
