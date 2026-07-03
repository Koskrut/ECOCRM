"use client";

import type { ReactNode } from "react";
import { Activity, BarChart3, Trophy } from "lucide-react";
import { deltaCountLine, deltaMoneyLine, deltaPctPoints } from "@/app/analytics/analytics-delta";
import { formatMoneyBase, formatNumber, formatPercent, KpiDeltaCard } from "@/app/analytics/analytics-ui";
import type { ManagerScorecardResponse } from "@/lib/api/resources/dashboard";
import type { BaseCurrency } from "@/lib/base-currency";
import { strings } from "@/locales";

type Props = {
  scorecard: ManagerScorecardResponse;
  currency: BaseCurrency;
  compareEnabled: boolean;
  periodLabel?: string;
  controls?: ReactNode;
};

export function ManagerScorecard({ scorecard, currency, compareEnabled, periodLabel, controls }: Props) {
  const t = strings.dashboard.manager.scorecard;
  const m = t.metrics;
  const { activity, outcomes } = scorecard;
  const cmp = compareEnabled ? activity.compare : undefined;
  const outCmp = compareEnabled ? outcomes.compare : undefined;

  return (
    <section className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
            <BarChart3 className="h-5 w-5 text-zinc-500" />
            {t.title}
          </h2>
          {periodLabel ? <p className="mt-1 text-sm text-zinc-500">{periodLabel}</p> : null}
        </div>
        {controls}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white/60 p-4 shadow-sm">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <Activity className="h-3.5 w-3.5" />
          {t.activityTitle}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiDeltaCard
            title={m.callsOutbound}
            value={formatNumber(activity.period.callsOutbound)}
            subtitle={`${t.todayLabel}: ${formatNumber(activity.today.callsOutbound)}`}
            variant="count"
            deltaLabel={deltaCountLine(activity.period.callsOutbound, cmp?.callsOutbound)}
          />
          <KpiDeltaCard
            title={m.callsInbound}
            value={formatNumber(activity.period.callsInbound)}
            subtitle={`${t.todayLabel}: ${formatNumber(activity.today.callsInbound)}`}
            variant="count"
            deltaLabel={deltaCountLine(activity.period.callsInbound, cmp?.callsInbound)}
          />
          <KpiDeltaCard
            title={m.visits}
            value={formatNumber(activity.period.visits)}
            subtitle={`${t.todayLabel}: ${formatNumber(activity.today.visits)}`}
            variant="count"
            deltaLabel={deltaCountLine(activity.period.visits, cmp?.visits)}
          />
          <KpiDeltaCard
            title={m.ordersCount}
            value={formatNumber(activity.period.ordersCount)}
            subtitle={`${t.todayLabel}: ${formatNumber(activity.today.ordersCount)}`}
            variant="count"
            deltaLabel={deltaCountLine(activity.period.ordersCount, cmp?.ordersCount)}
          />
          <KpiDeltaCard
            title={m.ordersAmount}
            value={formatMoneyBase(activity.period.ordersAmount, currency)}
            variant="money"
            deltaLabel={deltaMoneyLine(activity.period.ordersAmount, cmp?.ordersAmount)}
          />
          <KpiDeltaCard
            title={m.paymentsAmount}
            value={formatMoneyBase(activity.period.paymentsAmount, currency)}
            variant="money"
            deltaLabel={deltaMoneyLine(activity.period.paymentsAmount, cmp?.paymentsAmount)}
          />
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white/60 p-4 shadow-sm">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <Trophy className="h-3.5 w-3.5" />
          {t.outcomesTitle}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiDeltaCard
            title={m.leadsCreated}
            value={formatNumber(outcomes.leadsCreated)}
            variant="count"
            deltaLabel={deltaCountLine(outcomes.leadsCreated, outCmp?.leadsCreated)}
          />
          <KpiDeltaCard
            title={m.leadsWon}
            value={formatNumber(outcomes.leadsWon)}
            subtitle={`LOST: ${formatNumber(outcomes.leadsLost)}`}
            variant="count"
            deltaLabel={deltaCountLine(outcomes.leadsWon, outCmp?.leadsWon)}
          />
          <KpiDeltaCard
            title={m.wonShare}
            value={formatPercent(outcomes.wonShare)}
            variant="percent"
            deltaLabel={deltaPctPoints(outcomes.wonShare, outCmp?.wonShare)}
          />
          <KpiDeltaCard
            title={m.exactConversion}
            value={outcomes.exactConversion == null ? "—" : formatPercent(outcomes.exactConversion)}
            variant="percent"
          />
          <KpiDeltaCard
            title={m.bookedRevenue}
            value={formatMoneyBase(outcomes.bookedRevenue, currency)}
            variant="money"
            deltaLabel={deltaMoneyLine(outcomes.bookedRevenue, outCmp?.bookedRevenue)}
          />
          <KpiDeltaCard
            title={m.collectedPayments}
            value={formatMoneyBase(outcomes.collectedPayments, currency)}
            variant="money"
            deltaLabel={deltaMoneyLine(outcomes.collectedPayments, outCmp?.collectedPayments)}
          />
          <KpiDeltaCard
            title={m.avgCheck}
            value={formatMoneyBase(outcomes.avgCheck, currency)}
            variant="money"
            deltaLabel={deltaMoneyLine(outcomes.avgCheck, outCmp?.avgCheck)}
          />
          <KpiDeltaCard
            title={m.activeClientsInQueue}
            value={formatNumber(outcomes.activeClientsInQueue)}
            variant="count"
          />
        </div>
      </div>
    </section>
  );
}
