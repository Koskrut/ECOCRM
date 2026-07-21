"use client";

import {
  deltaCountLine,
  deltaMoneyLine,
} from "@/app/analytics/analytics-delta";
import { formatMoneyBase, formatNumber, KpiDeltaCard } from "@/app/analytics/analytics-ui";
import type { DashboardV2Response } from "@/lib/api/resources/dashboard";
import type { BaseCurrency } from "@/lib/base-currency";
import { strings } from "@/locales";

type Props = {
  sales: DashboardV2Response["sales"];
  currency: BaseCurrency;
  compareEnabled: boolean;
};

export function DashboardHeroKpis({ sales, currency, compareEnabled }: Props) {
  const kpi = sales.kpi;
  const cmp = sales.compare?.kpi;
  const t = strings.dashboard.leadership.heroKpis;

  return (
    <section className="min-w-0">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">{t.title}</h2>
        <p className="mt-1 text-sm text-zinc-500">{t.subtitle}</p>
      </div>
      <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiDeltaCard
          variant="money"
          title={t.bookedRevenue}
          subtitle={t.bookedRevenueHint}
          value={formatMoneyBase(kpi.bookedRevenue, currency)}
          deltaLabel={
            compareEnabled ? deltaMoneyLine(kpi.bookedRevenue, cmp?.bookedRevenue) : null
          }
        />
        <KpiDeltaCard
          variant="money"
          title={t.collectedPayments}
          subtitle={t.collectedPaymentsHint}
          value={formatMoneyBase(kpi.collectedPayments, currency)}
          deltaLabel={
            compareEnabled ? deltaMoneyLine(kpi.collectedPayments, cmp?.collectedPayments) : null
          }
        />
        <KpiDeltaCard
          variant="count"
          title={t.orders}
          subtitle={t.ordersHint}
          value={formatNumber(kpi.ordersCount)}
          deltaLabel={compareEnabled ? deltaCountLine(kpi.ordersCount, cmp?.ordersCount) : null}
        />
        <KpiDeltaCard
          variant="risk"
          title={t.overdueDebt}
          subtitle={t.overdueDebtHint}
          value={formatMoneyBase(kpi.overdueDebt, currency)}
          deltaLabel={null}
        />
      </div>
    </section>
  );
}
