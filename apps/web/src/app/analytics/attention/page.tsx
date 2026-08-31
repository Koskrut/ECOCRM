"use client";

import { useState } from "react";
import {
  AnalyticsErrorPanel,
  AnalyticsFiltersBar,
  AnalyticsOverviewSkeleton,
  SimpleTable,
  useAnalyticsFetch,
  useAnalyticsFilters,
} from "../analytics-ui";
import { strings } from "@/locales";

const at = strings.analytics.tasks;

type AttentionResponse = {
  crm: {
    overdueTasks: Array<{
      id: string;
      title: string;
      assigneeName: string | null;
      dueAt: string | null;
    }>;
    stuckOrders: Array<{
      id: string;
      orderNumber: string;
      ownerName: string | null;
      orderStage: string | null;
    }>;
    leadsWithoutTouch: Array<{
      id: string;
      name: string | null;
      ownerName: string | null;
      source: string | null;
    }>;
  };
  finance: {
    overdueOrders: Array<{
      id: string;
      orderNumber: string;
      clientName: string | null;
      debtAmount: number;
      paymentDueDate: string | null;
    }>;
  };
};

export default function AnalyticsAttentionPage() {
  const filters = useAnalyticsFilters();
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, loading, error } = useAnalyticsFetch<AttentionResponse>(
    "attention",
    filters.querySuffix,
    refreshKey,
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
    <div className="min-w-0 space-y-6">
      {filtersBar}

      <div className="rounded-xl border border-amber-200/70 bg-amber-50/30 p-4 text-sm text-amber-950/90">
        <p className="font-medium text-zinc-900">Період з панелі фільтрів</p>
        <p className="mt-1 text-zinc-700">
          Усі списки враховують діапазон дат і менеджера так само, як KPI на Overview. Прапорець
          «Порівняти з попереднім періодом» лише залишає узгоджений URL між вкладками; для Attention
          порівняння не показуємо.
        </p>
      </div>

      <section id="overdue-tasks" className="scroll-mt-24 space-y-2">
        <h2 className="text-base font-semibold text-zinc-900">{at.overdueTitle}</h2>
        <p className="text-xs text-zinc-500">
          Відкриті / в роботі, дедлайн до сьогодні (календар Kyiv).
        </p>
        <SimpleTable
          rows={data?.crm.overdueTasks ?? []}
          columns={[
            {
              key: "title",
              title: "Задача",
              render: (row) => (
                <a href={`/tasks?taskId=${row.id}`} className="font-medium text-zinc-900 underline hover:text-zinc-700">
                  {row.title}
                </a>
              ),
            },
            { key: "assigneeName", title: "Виконавець", render: (row) => row.assigneeName ?? "—" },
            { key: "dueAt", title: "Дедлайн", render: (row) => row.dueAt ?? "—" },
          ]}
        />
      </section>
      <section id="stuck-orders" className="scroll-mt-24 space-y-2">
        <h2 className="text-base font-semibold text-zinc-900">Завислі угоди</h2>
        <p className="text-xs text-zinc-500">
          Замовлення з createdAt у періоді; без руху стадії &gt; 3 дні станом на кінець періоду.
        </p>
        <SimpleTable
          rows={data?.crm.stuckOrders ?? []}
          columns={[
            { key: "orderNumber", title: "Замовлення", render: (row) => row.orderNumber },
            { key: "ownerName", title: "Власник", render: (row) => row.ownerName ?? "—" },
            { key: "orderStage", title: "Стадія", render: (row) => row.orderStage ?? "—" },
          ]}
        />
      </section>
      <section id="leads-without-touch" className="scroll-mt-24 space-y-2">
        <h2 className="text-base font-semibold text-zinc-900">Ліди без дотику</h2>
        <p className="text-xs text-zinc-500">
          Ліди з createdAt у періоді; правила «без дотику» vs кінець періоду.
        </p>
        <SimpleTable
          rows={data?.crm.leadsWithoutTouch ?? []}
          columns={[
            { key: "name", title: "Лід", render: (row) => row.name ?? "—" },
            { key: "source", title: "Джерело", render: (row) => row.source ?? "—" },
            { key: "ownerName", title: "Відповідальний", render: (row) => row.ownerName ?? "—" },
          ]}
        />
      </section>
      <section id="finance-overdue" className="scroll-mt-24 space-y-2">
        <h2 className="text-base font-semibold text-zinc-900">Прострочені оплати (замовлення)</h2>
        <p className="text-xs text-zinc-500">
          Борг &gt; 0 і paymentDueDate у минулому (календар Kyiv).
        </p>
        <SimpleTable
          rows={data?.finance.overdueOrders ?? []}
          columns={[
            { key: "orderNumber", title: "Замовлення", render: (row) => row.orderNumber },
            { key: "clientName", title: "Клієнт", render: (row) => row.clientName ?? "—" },
            {
              key: "paymentDueDate",
              title: "Оплата до",
              render: (row) => row.paymentDueDate ?? "—",
            },
          ]}
        />
      </section>
    </div>
  );
}
