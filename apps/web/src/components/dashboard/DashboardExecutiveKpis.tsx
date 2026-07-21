"use client";

import Link from "next/link";
import {
  deltaCountLine,
  deltaMoneyLine,
  deltaMoneyLineFine,
  deltaPctPoints,
} from "@/app/analytics/analytics-delta";
import {
  formatMoneyBase,
  formatMoneyBaseFine,
  formatNumber,
  formatPercent,
  KpiDeltaCard,
} from "@/app/analytics/analytics-ui";
import type { DashboardV2Response } from "@/lib/api/resources/dashboard";
import type { BaseCurrency } from "@/lib/base-currency";

type Props = {
  sales: DashboardV2Response["sales"];
  currency: BaseCurrency;
  compareEnabled: boolean;
  showAnalyticsLink?: boolean;
};

export function DashboardExecutiveKpis({
  sales,
  currency,
  compareEnabled,
  showAnalyticsLink,
}: Props) {
  const kpi = sales.kpi;
  const cmp = sales.compare?.kpi;

  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Ключові показники</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Заброньований дохід і зібрані оплати — різні метрики. Порівняння — лише коли увімкнено.
          </p>
        </div>
        {showAnalyticsLink ? (
          <Link
            href="/analytics/overview"
            className="text-sm font-medium text-sky-700 hover:text-sky-900 hover:underline"
          >
            Детальна аналітика →
          </Link>
        ) : null}
      </div>
      <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiDeltaCard
          variant="money"
          title="Заброньований дохід"
          subtitle="Замовлення за період (createdAt)"
          value={formatMoneyBase(kpi.bookedRevenue, currency)}
          deltaLabel={
            compareEnabled ? deltaMoneyLine(kpi.bookedRevenue, cmp?.bookedRevenue) : null
          }
        />
        <KpiDeltaCard
          variant="money"
          title="Зібрані оплати"
          subtitle="Оплати за період (paidAt)"
          value={formatMoneyBase(kpi.collectedPayments, currency)}
          deltaLabel={
            compareEnabled ? deltaMoneyLine(kpi.collectedPayments, cmp?.collectedPayments) : null
          }
        />
        <KpiDeltaCard
          variant="count"
          title="Замовлення"
          subtitle="Кількість замовлень"
          value={formatNumber(kpi.ordersCount)}
          deltaLabel={compareEnabled ? deltaCountLine(kpi.ordersCount, cmp?.ordersCount) : null}
        />
        <KpiDeltaCard
          variant="money"
          title="Середній чек"
          subtitle="Дохід / замовлення"
          value={formatMoneyBaseFine(kpi.avgCheck, currency)}
          deltaLabel={compareEnabled ? deltaMoneyLineFine(kpi.avgCheck, cmp?.avgCheck) : null}
        />
        <KpiDeltaCard
          variant="risk"
          title="Борг загалом"
          subtitle="Сума боргу за період"
          value={formatMoneyBase(kpi.debtTotal, currency)}
          deltaLabel={null}
        />
        <KpiDeltaCard
          variant="risk"
          title="Прострочений борг"
          subtitle="Прострочені з боргом"
          value={formatMoneyBase(kpi.overdueDebt, currency)}
          deltaLabel={null}
        />
        <KpiDeltaCard
          variant="count"
          title="Створені ліди"
          subtitle="Нові ліди за період"
          value={formatNumber(kpi.leadsCreatedCount)}
          deltaLabel={
            compareEnabled
              ? deltaCountLine(kpi.leadsCreatedCount, cmp?.leadsCreatedCount)
              : null
          }
        />
        <KpiDeltaCard
          variant="percent"
          title="Частка успішних (proxy)"
          subtitle="Успішні / створені ліди"
          value={formatPercent(kpi.leadConversionProxy)}
          deltaLabel={
            compareEnabled
              ? deltaPctPoints(kpi.leadConversionProxy, cmp?.leadConversionProxy)
              : null
          }
        />
      </div>
    </section>
  );
}
