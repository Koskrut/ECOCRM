"use client";

import {
  AnalyticsFiltersBar,
  AnalyticsState,
  KpiCard,
  SimpleTable,
  formatNumber,
  formatPercent,
  useAnalyticsFetch,
  useAnalyticsFilters,
} from "../analytics-ui";

type OperationsResponse = {
  createdTasks: number;
  completedTasks: number;
  overdueTasks: number;
  completionRate: number;
  byStatus: { status: string; count: number }[];
};

export default function AnalyticsOperationsPage() {
  const filters = useAnalyticsFilters();
  const { data, loading, error } = useAnalyticsFetch<OperationsResponse>("operations", filters.querySuffix);

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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard title="Created Tasks" value={formatNumber(data?.createdTasks)} />
          <KpiCard title="Completed Tasks" value={formatNumber(data?.completedTasks)} />
          <KpiCard title="Overdue Tasks" value={formatNumber(data?.overdueTasks)} />
          <KpiCard title="Completion Rate" value={formatPercent(data?.completionRate)} />
        </div>
        <SimpleTable
          rows={data?.byStatus ?? []}
          columns={[
            { key: "status", title: "Status", render: (row) => row.status },
            { key: "count", title: "Count", render: (row) => formatNumber(row.count) },
          ]}
        />
      </AnalyticsState>
    </div>
  );
}

