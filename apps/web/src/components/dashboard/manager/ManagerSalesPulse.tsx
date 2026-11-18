"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { formatMoneyBase, formatNumber } from "@/app/analytics/analytics-ui";
import type { ManagerScorecardResponse } from "@/lib/api/resources/dashboard";
import type { BaseCurrency } from "@/lib/base-currency";
import { strings } from "@/locales";

export type ManagerDebtSummary = {
  debtTotal: number;
  overdueDebt: number;
  clientsWithDebtCount: number;
};

type Props = {
  scorecard: ManagerScorecardResponse;
  currency: BaseCurrency;
  debt?: ManagerDebtSummary | null;
  debtLoading?: boolean;
  financeEnabled?: boolean;
};

export function ManagerSalesPulse({
  scorecard,
  currency,
  debt,
  debtLoading,
  financeEnabled,
}: Props) {
  const t = strings.dashboard.manager.salesPulse;
  const todayOrders = scorecard.activity.today.ordersCount;
  const todayAmount = scorecard.activity.today.ordersAmount;
  const monthOrders = scorecard.monthPulse.money.ordersCount;
  const monthAmount = scorecard.monthPulse.money.bookedRevenue;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
          <ShoppingCart className="h-5 w-5 text-sky-600" />
          {t.title}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">{t.subtitle}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={t.ordersToday} value={formatNumber(todayOrders)} />
        <MetricCard label={t.amountToday} value={formatMoneyBase(todayAmount, currency)} />
        <MetricCard label={t.ordersMonth} value={formatNumber(monthOrders)} />
        <MetricCard label={t.amountMonth} value={formatMoneyBase(monthAmount, currency)} />
      </div>

      {financeEnabled ? (
        <div className="mt-4 border-t border-zinc-100 pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-zinc-700">{t.debtTitle}</p>
            <Link
              href="/receivables?tab=work&view=clients"
              className="text-sm font-medium text-sky-700 hover:text-sky-900 hover:underline"
            >
              {t.debtOpen}
            </Link>
          </div>
          {debtLoading && !debt ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="h-20 animate-pulse rounded-lg bg-zinc-100" />
              <div className="h-20 animate-pulse rounded-lg bg-zinc-100" />
            </div>
          ) : debt ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard
                label={t.debtTotal}
                value={formatMoneyBase(debt.debtTotal, currency)}
                subtitle={t.clientsWithDebt.replace(
                  "{count}",
                  formatNumber(debt.clientsWithDebtCount),
                )}
                tone="debt"
              />
              <MetricCard
                label={t.overdueDebt}
                value={formatMoneyBase(debt.overdueDebt, currency)}
                tone={debt.overdueDebt > 0 ? "warn" : undefined}
              />
            </div>
          ) : (
            <p className="text-sm text-zinc-500">{t.debtUnavailable}</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function MetricCard({
  label,
  value,
  subtitle,
  tone,
}: {
  label: string;
  value: string;
  subtitle?: string;
  tone?: "debt" | "warn";
}) {
  const valueClass =
    tone === "warn"
      ? "text-amber-800"
      : tone === "debt"
        ? "text-zinc-900"
        : "text-zinc-900";
  return (
    <div
      className={`rounded-lg border px-3 py-3 ${
        tone === "warn"
          ? "border-amber-100 bg-amber-50/60"
          : "border-zinc-100 bg-zinc-50/80"
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${valueClass}`}>{value}</p>
      {subtitle ? <p className="mt-1 text-xs text-zinc-500">{subtitle}</p> : null}
    </div>
  );
}
