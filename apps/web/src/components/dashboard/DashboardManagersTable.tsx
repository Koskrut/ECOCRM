"use client";

import Link from "next/link";
import {
  formatMoneyBase,
  formatMoneyBaseFine,
  formatNumber,
  SimpleTable,
} from "@/app/analytics/analytics-ui";
import { DayPlanPercentBadge } from "@/components/day-plan/DayPlanWidget";
import type { DashboardV2ManagerRow } from "@/lib/api/resources/dashboard";
import type { BaseCurrency } from "@/lib/base-currency";

type Props = {
  managers: DashboardV2ManagerRow[];
  currency: BaseCurrency;
  activityDate: string;
};

export function DashboardManagersTable({ managers, currency, activityDate }: Props) {
  if (managers.length === 0) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Менеджери за період</h2>
        <p className="mt-2 text-sm text-zinc-500">Немає даних за обраний період.</p>
      </section>
    );
  }

  return (
    <section className="min-w-0 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Менеджери за період</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Продажі, активність і якість. % плану дня — на {activityDate}.
          </p>
        </div>
        <Link
          href="/analytics/managers"
          className="text-sm font-medium text-sky-700 hover:text-sky-900 hover:underline"
        >
          Детальніше →
        </Link>
      </div>
      <div className="mt-4 min-w-0 overflow-x-auto">
        <SimpleTable
          rows={managers}
          columns={[
            {
              key: "name",
              title: "Менеджер",
              render: (row) => (
                <Link
                  href={`/work/day-plan?date=${encodeURIComponent(activityDate)}&userId=${encodeURIComponent(row.id)}`}
                  className="font-medium text-zinc-900 hover:text-sky-700 hover:underline"
                >
                  {row.name}
                </Link>
              ),
            },
            {
              key: "dayPlan",
              title: "% плану (сьогодні)",
              render: (row) => (
                <DayPlanPercentBadge percent={row.dayPlanPercent} status={row.dayPlanStatus} />
              ),
            },
            {
              key: "bookedRevenue",
              title: "Booked",
              render: (row) => formatMoneyBase(row.bookedRevenue, currency),
            },
            {
              key: "collectedPayments",
              title: "Collected",
              render: (row) => formatMoneyBase(row.collectedPayments, currency),
            },
            {
              key: "ordersCount",
              title: "Orders",
              render: (row) => formatNumber(row.ordersCount),
            },
            {
              key: "avgCheck",
              title: "Avg check",
              render: (row) => formatMoneyBaseFine(row.avgCheck, currency),
            },
            {
              key: "callsOutbound",
              title: "Дзвінки",
              render: (row) => formatNumber(row.callsOutbound),
            },
            {
              key: "visitsDone",
              title: "Візити",
              render: (row) => formatNumber(row.visitsDone),
            },
            {
              key: "overdueTasks",
              title: "Простроч. задачі",
              render: (row) =>
                row.overdueTasks > 0 ? (
                  <span className="font-medium text-amber-800">{row.overdueTasks}</span>
                ) : (
                  formatNumber(row.overdueTasks)
                ),
            },
            {
              key: "visitsWithoutNote",
              title: "Без нотатки",
              render: (row) =>
                row.visitsWithoutNote > 0 ? (
                  <span className="font-medium text-red-700">{row.visitsWithoutNote}</span>
                ) : (
                  formatNumber(row.visitsWithoutNote)
                ),
            },
          ]}
        />
      </div>
    </section>
  );
}
