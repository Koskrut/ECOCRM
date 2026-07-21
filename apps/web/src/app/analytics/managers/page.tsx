"use client";

import { useState } from "react";
import {
  AnalyticsErrorPanel,
  AnalyticsFiltersBar,
  AnalyticsOverviewSkeleton,
  SimpleTable,
  formatMoneyBase,
  formatMoneyBaseFine,
  formatNumber,
  useAnalyticsFetch,
  useAnalyticsFilters,
} from "../analytics-ui";
import { strings } from "@/locales";

const at = strings.analytics.tasks;

type ManagerRow = {
  id: string;
  name: string;
  bookedRevenue: number;
  collectedPayments: number;
  ordersCount: number;
  avgCheck: number;
  overdueTasks: number;
};

type ManagersResponse = {
  currency?: string;
  managers: ManagerRow[];
};

export default function AnalyticsManagersPage() {
  const filters = useAnalyticsFilters();
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, loading, error } = useAnalyticsFetch<ManagersResponse>(
    "managers",
    filters.querySuffix,
    refreshKey,
  );
  const rows = data?.managers ?? [];
  const currency = data?.currency === "EUR" ? "EUR" : "USD";

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
    <div className="min-w-0 space-y-4">
      {filtersBar}
      <section className="min-w-0">
        <h2 className="text-lg font-semibold text-zinc-900">Менеджери</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Заброньовано / зібрано / замовлення — за період (як у Продажах). {at.overdueSnapshot} — операційний знімок
          по виконавцю. Прапорець compare в URL не змінює цей endpoint (немає compare у API).
        </p>
        <div className="mt-4 min-w-0 overflow-x-auto">
          <SimpleTable
            rows={rows}
            columns={[
              { key: "name", title: "Менеджер", render: (row) => row.name },
              {
                key: "bookedRevenue",
                title: "Заброньований дохід",
                render: (row) => formatMoneyBase(row.bookedRevenue, currency),
              },
              {
                key: "collectedPayments",
                title: "Зібрані оплати",
                render: (row) => formatMoneyBase(row.collectedPayments, currency),
              },
              {
                key: "ordersCount",
                title: "Замовлення",
                render: (row) => formatNumber(row.ordersCount),
              },
              {
                key: "avgCheck",
                title: "Avg check",
                render: (row) => formatMoneyBaseFine(row.avgCheck, currency),
              },
              {
                key: "overdueTasks",
                title: at.overdueSnapshot,
                render: (row) => formatNumber(row.overdueTasks),
              },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
