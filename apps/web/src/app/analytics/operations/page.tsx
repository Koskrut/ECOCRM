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
import { strings } from "@/locales";
import { taskStatusLabel } from "@/lib/task-labels";
import type { TaskStatus } from "@/lib/api/resources/tasks";

const at = strings.analytics.tasks;

type OperationsResponse = {
  createdTasks: number;
  completedTasks: number;
  overdueTasks: number;
  completionRate: number;
  byStatus: { status: string; count: number }[];
};

export default function AnalyticsOperationsPage() {
  const filters = useAnalyticsFilters();
  const { data, loading, error } = useAnalyticsFetch<OperationsResponse>(
    "operations",
    filters.querySuffix,
  );

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
          <KpiCard title={at.createdTasks} value={formatNumber(data?.createdTasks)} />
          <KpiCard title={at.completedTasks} value={formatNumber(data?.completedTasks)} />
          <KpiCard title={at.overdueTasks} value={formatNumber(data?.overdueTasks)} />
          <KpiCard title={at.completionRate} value={formatPercent(data?.completionRate)} />
        </div>
        <SimpleTable
          rows={data?.byStatus ?? []}
          columns={[
            {
              key: "status",
              title: at.statusColumn,
              render: (row) => {
                const s = row.status as TaskStatus;
                return ["OPEN", "IN_PROGRESS", "DONE", "CANCELED"].includes(s)
                  ? taskStatusLabel(s)
                  : row.status;
              },
            },
            { key: "count", title: at.countColumn, render: (row) => formatNumber(row.count) },
          ]}
        />
      </AnalyticsState>
    </div>
  );
}
