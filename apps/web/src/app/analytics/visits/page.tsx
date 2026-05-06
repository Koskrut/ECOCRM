"use client";

import {
  AnalyticsFiltersBar,
  AnalyticsState,
  KpiCard,
  SimpleTable,
  formatNumber,
  useAnalyticsFetch,
  useAnalyticsFilters,
} from "../analytics-ui";

type VisitsResponse = {
  total: number;
  byStatus: { status: string; count: number }[];
  byManager: { managerId: string | null; managerName: string | null; count: number }[];
};

export default function AnalyticsVisitsPage() {
  const filters = useAnalyticsFilters();
  const { data, loading, error } = useAnalyticsFetch<VisitsResponse>("visits", filters.querySuffix);

  return (
    <div className="space-y-4">
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
      <AnalyticsState loading={loading} error={error}>
        <div className="grid gap-3 sm:grid-cols-3">
          <KpiCard title="Visits Total" value={formatNumber(data?.total)} />
          <KpiCard title="Statuses" value={formatNumber(data?.byStatus.length)} />
          <KpiCard title="Managers" value={formatNumber(data?.byManager.length)} />
        </div>
        <SimpleTable
          rows={data?.byStatus ?? []}
          columns={[
            { key: "status", title: "Статус", render: (row) => row.status },
            { key: "count", title: "Кількість", render: (row) => formatNumber(row.count) },
          ]}
        />
        <SimpleTable
          rows={data?.byManager ?? []}
          columns={[
            {
              key: "managerName",
              title: "Менеджер",
              render: (row) => row.managerName ?? row.managerId ?? "Unknown",
            },
            { key: "count", title: "Візити", render: (row) => formatNumber(row.count) },
          ]}
        />
      </AnalyticsState>
    </div>
  );
}
