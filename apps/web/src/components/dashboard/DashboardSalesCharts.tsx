"use client";

import {
  BookedRevenueTrendChart,
  CollectedPaymentsTrendChart,
  OrdersByStageBarChart,
} from "@/app/analytics/overview/overview-charts";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { DashboardV2Response } from "@/lib/api/resources/dashboard";
import type { BaseCurrency } from "@/lib/base-currency";

const CHART_COLORS = [
  "#0ea5e9",
  "#06b6d4",
  "#0284c7",
  "#0891b2",
  "#0c4a6e",
  "#155e75",
  "#0369a1",
  "#22d3ee",
];

const LEAD_STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  IN_PROGRESS: "In progress",
  WON: "Won",
  NOT_TARGET: "Not target",
  LOST: "Lost",
  SPAM: "Spam",
};

const LEAD_SOURCE_LABELS: Record<string, string> = {
  FACEBOOK: "Facebook",
  TELEGRAM: "Telegram",
  INSTAGRAM: "Instagram",
  WEBSITE: "Website",
  OTHER: "Other",
};

type Props = {
  charts: DashboardV2Response["sales"]["charts"];
  currency: BaseCurrency;
};

export function DashboardSalesCharts({ charts, currency }: Props) {
  const leadsByStatus = charts.leadsByStatus.map((r) => ({
    name: LEAD_STATUS_LABELS[r.status] ?? r.status,
    value: r.count,
  }));
  const leadsBySource = charts.leadsBySource.map((r) => ({
    name: LEAD_SOURCE_LABELS[r.source] ?? r.source,
    value: r.count,
  }));

  return (
    <section className="min-w-0 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Продажі та воронка</h2>
        <p className="mt-1 text-sm text-zinc-500">Тренди та структура за обраний період.</p>
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <BookedRevenueTrendChart rows={charts.bookedRevenueByDay} currency={currency} />
        <CollectedPaymentsTrendChart rows={charts.collectedPaymentsByDay} currency={currency} />
      </div>
      <OrdersByStageBarChart rows={charts.ordersByStage} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PieCard title="Leads by status" data={leadsByStatus} />
        <PieCard title="Leads by source" data={leadsBySource} />
      </div>
    </section>
  );
}

function PieCard({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-zinc-700">{title}</h3>
      <div className="h-64">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, percent }) =>
                  `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                }
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-400">
            No data for period
          </div>
        )}
      </div>
    </div>
  );
}
