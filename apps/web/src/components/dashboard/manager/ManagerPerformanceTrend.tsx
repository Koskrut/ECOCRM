"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ManagerTrend } from "@/lib/api/resources/dashboard";
import type { BaseCurrency } from "@/lib/base-currency";
import { baseCurrencySymbol } from "@/lib/base-currency";
import { strings } from "@/locales";

type Props = {
  trend: ManagerTrend;
  currency: BaseCurrency;
};

type MetricKey = "bookedRevenue" | "collectedPayments" | "shippedClients";

function dayOfMonth(ymd: string): number {
  const parts = ymd.split("-");
  return Number(parts[2] ?? 0);
}

function buildTrendChartData(
  trend: ManagerTrend,
  metric: MetricKey,
): Array<{ day: number; current?: number; previous?: number }> {
  const map = new Map<number, { day: number; current?: number; previous?: number }>();
  for (const row of trend.current) {
    const day = dayOfMonth(row.date);
    if (!day) continue;
    const point = map.get(day) ?? { day };
    point.current = row[metric];
    map.set(day, point);
  }
  for (const row of trend.previousMonth) {
    const day = dayOfMonth(row.date);
    if (!day) continue;
    const point = map.get(day) ?? { day };
    point.previous = row[metric];
    map.set(day, point);
  }
  return [...map.values()].sort((a, b) => a.day - b.day);
}

export function ManagerPerformanceTrend({ trend, currency }: Props) {
  const t = strings.dashboard.manager.trend;
  const [metric, setMetric] = useState<MetricKey>("bookedRevenue");
  const sym = baseCurrencySymbol(currency);
  const data = buildTrendChartData(trend, metric);

  const metricLabel =
    metric === "bookedRevenue"
      ? t.booked
      : metric === "collectedPayments"
        ? t.collected
        : t.shipped;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">{t.title}</h2>
          <p className="mt-1 text-sm text-zinc-500">{t.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1">
          {(
            [
              ["bookedRevenue", t.booked],
              ["collectedPayments", t.collected],
              ["shippedClients", t.shipped],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMetric(key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                metric === key
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500">{t.empty}</p>
      ) : (
        <div className="mt-4 h-64 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#71717a" }} />
              <YAxis
                tick={{ fontSize: 11, fill: "#71717a" }}
                width={48}
                tickFormatter={(v: number) =>
                  metric === "shippedClients" ? String(v) : `${Math.round(v)}`
                }
              />
              <Tooltip
                formatter={(value: number | string) => {
                  const num = Number(value);
                  if (metric === "shippedClients") return [num, metricLabel];
                  return [`${Math.round(num)} ${sym}`, metricLabel];
                }}
                labelFormatter={(day) => t.dayLabel.replace("{day}", String(day))}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="current"
                name={t.current}
                stroke="#0284c7"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="previous"
                name={t.previous}
                stroke="#a1a1aa"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
