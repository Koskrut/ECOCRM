"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AnalyticsErrorPanel,
  AnalyticsFiltersBar,
  AnalyticsOverviewSkeleton,
  KpiDeltaCard,
  formatMoneyBase,
  formatMoneyBaseFine,
  formatNumber,
  formatPercent,
  useAnalyticsFetch,
  useAnalyticsFilters,
} from "../analytics-ui";
import { CollectedPaymentsDrilldownModal } from "../CollectedPaymentsDrilldownModal";
import {
  BookedRevenueTrendChart,
  CollectedPaymentsTrendChart,
  OrdersByStageBarChart,
} from "./overview-charts";
import {
  deltaCountLine,
  deltaMoneyLine,
  deltaMoneyLineFine,
  deltaPctPoints,
} from "../analytics-delta";

type OverviewPayload = {
  kpi: {
    bookedRevenue: number;
    collectedPayments: number;
    ordersCount: number;
    avgCheck: number;
    debtTotal: number;
    overdueDebt: number;
    leadConversionProxy: number;
    leadsCreatedCount: number;
  };
  charts: {
    bookedRevenueByDay: { date: string; amount: number; ordersCount: number }[];
    collectedPaymentsByDay: { date: string; amount: number; paymentCount: number }[];
    ordersByStage: { stage: string; count: number }[];
  };
  attention: {
    crm: {
      overdueTasksCount: number;
      stuckOrdersCount: number;
      leadsWithoutTouchCount: number;
    };
    finance: { overdueOrdersCount: number; overdueDebtAmount: number };
  };
};

type OverviewResponse = {
  currency?: string;
  data: OverviewPayload;
  /** KPI-only prior period; charts and attention are not returned here. */
  compare?: { kpi: OverviewPayload["kpi"] };
};

export default function AnalyticsOverviewPage() {
  const router = useRouter();
  const filters = useAnalyticsFilters();
  const [refreshKey, setRefreshKey] = useState(0);
  const [paymentsDrillOpen, setPaymentsDrillOpen] = useState(false);

  const { data, loading, error } = useAnalyticsFetch<OverviewResponse>(
    "overview",
    filters.querySuffix,
    refreshKey,
  );

  const kpi = data?.data.kpi;
  const currency = data?.currency === "EUR" ? "EUR" : "USD";
  const charts = data?.data.charts;
  const attention = data?.data.attention;
  const cmp = data?.compare?.kpi;

  const attentionHref = useMemo(
    () => `/analytics/attention${filters.querySuffix}`,
    [filters.querySuffix],
  );

  const filtersBar = (
    <AnalyticsFiltersBar
      dateFrom={filters.dateFrom}
      dateTo={filters.dateTo}
      managerId={filters.managerId}
      managers={filters.managers}
      rangePreset={filters.rangePreset}
      comparePrev={filters.comparePrev}
      onDateFromChange={filters.setDateFrom}
      onDateToChange={filters.setDateTo}
      onManagerIdChange={filters.setManagerId}
      onRangePresetChange={filters.setRangePreset}
      onComparePrevChange={filters.setComparePrev}
    />
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {filtersBar}
        <AnalyticsOverviewSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        {filtersBar}
        <AnalyticsErrorPanel message={error} onRetry={() => setRefreshKey((k) => k + 1)} />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-8">
      {filtersBar}

      <section className="min-w-0">
        <h2 className="text-lg font-semibold text-zinc-900">Ключові показники</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Заброньований дохід і зібрані оплати — різні метрики (дата створення замовлення vs дата
          оплати). Порівняння з попереднім періодом — лише коли увімкнено фільтр.
        </p>
        <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiDeltaCard
            variant="money"
            title="Заброньований дохід"
            subtitle="max(0, total − returns) → USD за період (createdAt)"
            tooltip="Не змішувати з collected payments."
            value={formatMoneyBase(kpi?.bookedRevenue, currency)}
            deltaLabel={
              filters.comparePrev
                ? deltaMoneyLine(kpi?.bookedRevenue ?? 0, cmp?.bookedRevenue)
                : null
            }
          />
          <KpiDeltaCard
            variant="money"
            title="Зібрані оплати"
            subtitle="Завершені оплати, дата paidAt → USD"
            tooltip="Окремо від booked revenue."
            value={formatMoneyBase(kpi?.collectedPayments, currency)}
            deltaLabel={
              filters.comparePrev
                ? deltaMoneyLine(kpi?.collectedPayments ?? 0, cmp?.collectedPayments)
                : null
            }
            onDrill={() => setPaymentsDrillOpen(true)}
          />
          <KpiDeltaCard
            variant="count"
            title="Замовлення"
            subtitle="Замовлення у періоді (createdAt)"
            value={formatNumber(kpi?.ordersCount)}
            deltaLabel={
              filters.comparePrev ? deltaCountLine(kpi?.ordersCount ?? 0, cmp?.ordersCount) : null
            }
          />
          <KpiDeltaCard
            variant="money"
            title="Середній чек"
            subtitle="Дохід / замовлення (USD)"
            tooltip="Те саме, що bookedRevenue / ordersCount для обраного періоду; порівняння — попередній період тієї ж довжини."
            value={formatMoneyBaseFine(kpi?.avgCheck, currency)}
            deltaLabel={
              filters.comparePrev ? deltaMoneyLineFine(kpi?.avgCheck ?? 0, cmp?.avgCheck) : null
            }
          />
          <KpiDeltaCard
            variant="risk"
            title="Борг загалом"
            subtitle="Сума debtAmount у замовленнях за вибраний період"
            tooltip="Розрахунок у межах обраного діапазону дат overview."
            value={formatMoneyBase(kpi?.debtTotal, currency)}
            deltaLabel={null}
          />
          <KpiDeltaCard
            variant="risk"
            title="Прострочений борг"
            subtitle="Прострочені + борг за вибраний період"
            tooltip="Розрахунок у межах обраного діапазону дат overview."
            value={formatMoneyBase(kpi?.overdueDebt, currency)}
            deltaLabel={null}
            onDrill={() => router.push(`${attentionHref}#finance-overdue`, { scroll: false })}
            drillLabel="До списку замовлень →"
          />
          <KpiDeltaCard
            variant="count"
            title="Створені ліди"
            subtitle="Ліди з createdAt у періоді"
            value={formatNumber(kpi?.leadsCreatedCount)}
            deltaLabel={
              filters.comparePrev
                ? deltaCountLine(kpi?.leadsCreatedCount ?? 0, cmp?.leadsCreatedCount)
                : null
            }
          />
          <KpiDeltaCard
            variant="percent"
            title="Частка успішних (proxy)"
            subtitle="Успішні / створені ліди у періоді"
            tooltip="Не конверсія в замовлення; API поле leadConversionProxy."
            value={formatPercent(kpi?.leadConversionProxy)}
            deltaLabel={
              filters.comparePrev
                ? deltaPctPoints(kpi?.leadConversionProxy ?? 0, cmp?.leadConversionProxy)
                : null
            }
          />
        </div>
      </section>

      <section className="min-w-0">
        <h2 className="text-lg font-semibold text-zinc-900">Динаміка та структура</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Тренди — лише для обраного періоду на overview. Порівняння періодів дивіться у KPI вище.
        </p>
        <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2">
          <BookedRevenueTrendChart rows={charts?.bookedRevenueByDay ?? []} currency={currency} />
          <CollectedPaymentsTrendChart rows={charts?.collectedPaymentsByDay ?? []} currency={currency} />
        </div>
        <div className="mt-4">
          <OrdersByStageBarChart rows={charts?.ordersByStage ?? []} />
        </div>
      </section>

      <section className="min-w-0 rounded-xl border border-amber-200/60 bg-amber-50/20 p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Потребує уваги</h2>
        <p className="mt-1 text-sm text-amber-900/80">
          Лічильники та посилання на Attention узгоджені з обраним діапазоном дат (ті самі правила
          фільтрації, що й на{" "}
          <Link
            href={attentionHref}
            className="font-medium text-indigo-800 underline-offset-2 hover:underline"
          >
            /analytics/attention
          </Link>
          ).
        </p>
        <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AttentionTile
            title="Прострочені завдання"
            count={attention?.crm.overdueTasksCount ?? 0}
            href={`${attentionHref}#overdue-tasks`}
            hint="Завдання з минулим дедлайном"
          />
          <AttentionTile
            title="Завислі угоди"
            count={attention?.crm.stuckOrdersCount ?? 0}
            href={`${attentionHref}#stuck-orders`}
            hint="Без руху стадії &gt; 3 дні"
          />
          <AttentionTile
            title="Ліди без дотику"
            count={attention?.crm.leadsWithoutTouchCount ?? 0}
            href={`${attentionHref}#leads-without-touch`}
            hint="Нові / в роботі без активності"
          />
          <AttentionTile
            title="Прострочені оплати (замовлення)"
            count={attention?.finance.overdueOrdersCount ?? 0}
            href={`${attentionHref}#finance-overdue`}
            hint="Прострочені з боргом &gt; 0"
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={`${attentionHref}#overdue-tasks`}
            scroll={false}
            className="inline-flex items-center rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Відкрити Attention
          </Link>
          <span className="self-center text-xs text-zinc-500">
            Сума простроченого боргу (attention):{" "}
            {formatMoneyBase(attention?.finance.overdueDebtAmount, currency)}
          </span>
        </div>
      </section>

      <CollectedPaymentsDrilldownModal
        open={paymentsDrillOpen}
        onClose={() => setPaymentsDrillOpen(false)}
        querySuffix={filters.querySuffix}
        kpiCollectedAmount={kpi?.collectedPayments}
        currency={currency}
      />
    </div>
  );
}

function AttentionTile({
  title,
  count,
  href,
  hint,
}: {
  title: string;
  count: number;
  href: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className="block rounded-lg border border-amber-200/80 bg-white p-4 shadow-sm transition hover:border-amber-300 hover:shadow"
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-zinc-900">{count}</div>
      <p className="mt-1 text-xs text-zinc-500">{hint}</p>
      <div className="mt-2 text-xs font-medium text-zinc-700">Перейти →</div>
    </Link>
  );
}
