"use client";

import { DateTime } from "luxon";
import { Target, TrendingUp, Users } from "lucide-react";
import { deltaCountLine, deltaMoneyLine, deltaPctPoints } from "@/app/analytics/analytics-delta";
import {
  formatMoneyBase,
  formatNumber,
  formatPercent,
  KpiDeltaCard,
} from "@/app/analytics/analytics-ui";
import type { ManagerMonthPulse } from "@/lib/api/resources/dashboard";
import type { BaseCurrency } from "@/lib/base-currency";
import { CRM_LOCALE, CRM_TIME_ZONE } from "@/lib/crmDatetime";
import { strings } from "@/locales";

type Props = {
  pulse: ManagerMonthPulse;
  currency: BaseCurrency;
};

function formatShortRange(period: { from: string; to: string }): string {
  const from = DateTime.fromISO(period.from, { setZone: true })
    .setZone(CRM_TIME_ZONE)
    .setLocale(CRM_LOCALE);
  const to = DateTime.fromISO(period.to, { setZone: true })
    .setZone(CRM_TIME_ZONE)
    .setLocale(CRM_LOCALE);
  if (!from.isValid || !to.isValid) return "";
  return `${from.toLocaleString({ day: "numeric", month: "short" })} – ${to.toLocaleString({ day: "numeric", month: "short" })}`;
}

export function ManagerMonthPulse({ pulse, currency }: Props) {
  const t = strings.dashboard.manager.monthPulse;
  const { coverage, money, conversion } = pulse;
  const dayProgress = t.dayProgress
    .replace("{elapsed}", String(pulse.daysElapsed))
    .replace("{total}", String(pulse.daysInMonth));
  const paceCoverage =
    coverage.clientBase > 0
      ? Math.round((coverage.previousMonthPace / coverage.clientBase) * 1000) / 10
      : 0;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
            <Target className="h-5 w-5 text-sky-600" />
            {t.title}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">{t.subtitle}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-600">
          {dayProgress}
          {formatShortRange(pulse.period) ? (
            <span className="ml-2 text-zinc-400">{formatShortRange(pulse.period)}</span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiDeltaCard
          title={t.shippedClients}
          value={formatNumber(coverage.shippedClients)}
          subtitle={t.ofBase.replace("{base}", formatNumber(coverage.clientBase))}
          tooltip={t.tooltips.shipped}
          variant="count"
          deltaLabel={deltaCountLine(coverage.shippedClients, coverage.previousMonthPace)}
        />
        <KpiDeltaCard
          title={t.coverage}
          value={formatPercent(coverage.coveragePercent)}
          subtitle={`${t.unshipped}: ${formatNumber(coverage.unshippedClients)} · ${t.vsFull.replace("{value}", formatNumber(coverage.previousMonthFull))}`}
          tooltip={`${t.tooltips.coverage} ${t.tooltips.pace}`}
          variant="percent"
          deltaLabel={deltaPctPoints(coverage.coveragePercent, paceCoverage) ?? t.vsPace}
        />
        <KpiDeltaCard
          title={t.bookedRevenue}
          value={formatMoneyBase(money.bookedRevenue, currency)}
          subtitle={
            money.forecastBookedRevenue != null
              ? `${t.forecast}: ${formatMoneyBase(money.forecastBookedRevenue, currency)}`
              : undefined
          }
          tooltip={t.tooltips.forecast}
          variant="money"
          deltaLabel={deltaMoneyLine(
            money.bookedRevenue,
            money.previousMonthPace.bookedRevenue,
            currency,
          )}
        />
        <KpiDeltaCard
          title={t.collectedPayments}
          value={formatMoneyBase(money.collectedPayments, currency)}
          subtitle={`${t.conversion}: ${
            conversion.exactConversion == null ? "—" : formatPercent(conversion.exactConversion)
          }`}
          tooltip={t.tooltips.conversion}
          variant="money"
          deltaLabel={deltaMoneyLine(
            money.collectedPayments,
            money.previousMonthPace.collectedPayments,
            currency,
          )}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1">
          <Users className="h-3.5 w-3.5" />
          {t.vsPace}
        </span>
        <span className="inline-flex items-center gap-1" title={t.forecastHint}>
          <TrendingUp className="h-3.5 w-3.5" />
          {t.forecastHint}
        </span>
      </div>
    </section>
  );
}
