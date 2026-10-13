"use client";

import { strings as t } from "@/locales";

export type CurrencyTotal = { currency: string; amount: number };

export type UnmatchedMonthlySummary = {
  months: Array<{ month: string; count: number; totals: CurrencyTotal[] }>;
  total: { count: number; totals: CurrencyTotal[] };
};

const amountFormatter = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 });
const monthFormatter = new Intl.DateTimeFormat("uk-UA", { month: "long", timeZone: "UTC" });

function currencySymbol(currency: string): string {
  if (currency === "UAH") return "₴";
  if (currency === "USD") return "$";
  if (currency === "EUR") return "€";
  return currency;
}

export function formatCurrencyTotals(totals: CurrencyTotal[]): string {
  return totals
    .map((x) => `${amountFormatter.format(x.amount)} ${currencySymbol(x.currency)}`)
    .join(" · ");
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const name = monthFormatter.format(new Date(Date.UTC(y!, m! - 1, 1)));
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}

/** YYYY-MM → inclusive YYYY-MM-DD bounds. */
export function monthDateRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

/** Month whose exact bounds equal the date filter, if any. */
export function monthFromDateRange(dateFrom: string, dateTo: string): string | null {
  const month = dateFrom.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const range = monthDateRange(month);
  return range.from === dateFrom && range.to === dateTo ? month : null;
}

function currentKyivMonth(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

export function UnmatchedMonthsBar({
  summary,
  activeMonth,
  hasDateFilter,
  onSelectMonth,
}: {
  summary: UnmatchedMonthlySummary | null;
  activeMonth: string | null;
  hasDateFilter: boolean;
  onSelectMonth: (month: string | null) => void;
}) {
  if (!summary) return null;
  const nowMonth = currentKyivMonth();
  const chipBase =
    "flex flex-col items-start rounded-lg border px-3 py-1.5 text-left text-xs transition-colors";

  return (
    <div className="border-b border-zinc-200 px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-semibold text-zinc-900">
          {t.payments.unmatchedSummaryTitle(summary.total.count)}
        </span>
        {summary.total.totals.length > 0 && (
          <span className="text-sm tabular-nums text-zinc-600">
            {formatCurrencyTotals(summary.total.totals)}
          </span>
        )}
      </div>
      {summary.months.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSelectMonth(null)}
            className={`${chipBase} ${
              !hasDateFilter
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            <span className="font-medium">{t.payments.unmatchedAllMonths}</span>
            <span className="tabular-nums opacity-80">{summary.total.count}</span>
          </button>
          {summary.months.map((m) => {
            const active = activeMonth === m.month;
            const stale = m.month < nowMonth;
            return (
              <button
                key={m.month}
                type="button"
                onClick={() => onSelectMonth(active ? null : m.month)}
                title={formatCurrencyTotals(m.totals)}
                className={`${chipBase} ${
                  active
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : stale
                      ? "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                <span className="font-medium">{monthLabel(m.month)}</span>
                <span className="tabular-nums opacity-80">
                  {t.payments.unmatchedMonthChip(m.count, formatCurrencyTotals(m.totals))}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-1 text-sm text-emerald-700">{t.payments.unmatchedAllDone}</p>
      )}
    </div>
  );
}
