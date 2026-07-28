"use client";

import Link from "next/link";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber } from "@/app/analytics/analytics-ui";
import type { DashboardV2Quality } from "@/lib/api/resources/dashboard";
import { DateTime } from "luxon";
import { CRM_LOCALE, CRM_TIME_ZONE } from "@/lib/crmDatetime";
import { VISIT_OUTCOME_UA } from "@/lib/status-labels";

const OUTCOME_LABELS: Record<string, string> = {
  ...VISIT_OUTCOME_UA,
  UNKNOWN: "Невідомо",
};

type Props = {
  quality: DashboardV2Quality;
};

function formatShortDate(dateStr: string): string {
  const dt = DateTime.fromISO(dateStr, { zone: CRM_TIME_ZONE }).setLocale(CRM_LOCALE);
  if (!dt.isValid) return dateStr;
  return dt.toLocaleString({ month: "short", day: "numeric" });
}

export function DashboardQualityPanel({ quality }: Props) {
  const trendData = quality.dayPlanTrend.map((d) => ({
    date: formatShortDate(d.date),
    percent: d.percent,
  }));

  return (
    <section className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Якість роботи</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Візити, дисципліна плану дня, дзвінки та follow-up.
          </p>
        </div>
        <Link
          href="/analytics/visits"
          className="text-sm font-medium text-sky-700 hover:text-sky-900 hover:underline"
        >
          Аналітика візитів →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <QualityStat title="Завершені візити" value={quality.visits.totalDone} />
        <QualityStat
          title="Без нотатки результату"
          value={quality.visits.withoutResultNote}
          risk={quality.visits.withoutResultNote > 0}
        />
        <QualityStat title="З follow-up" value={quality.visits.withFollowUp} />
        <QualityStat title="GPS на старті ✓" value={quality.visits.gpsVerifiedStart} />
        <QualityStat title="GPS на завершенні ✓" value={quality.visits.gpsVerifiedComplete} />
        <QualityStat
          title="Простроч. follow-up"
          value={quality.overdueFollowUps}
          risk={quality.overdueFollowUps > 0}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-700">Дзвінки за період</h3>
          <div className="mt-3 flex gap-6">
            <div>
              <p className="text-xs text-zinc-500">Вхідні</p>
              <p className="text-2xl font-semibold text-zinc-900">
                {formatNumber(quality.calls.inbound)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Вихідні</p>
              <p className="text-2xl font-semibold text-zinc-900">
                {formatNumber(quality.calls.outbound)}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-700">Результати візитів</h3>
          {quality.visits.byOutcome.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">Немає даних</p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {quality.visits.byOutcome.map((o) => (
                <li key={o.outcome} className="flex justify-between text-sm">
                  <span className="text-zinc-600">
                    {OUTCOME_LABELS[o.outcome] ?? o.outcome}
                  </span>
                  <span className="font-medium tabular-nums text-zinc-900">{o.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {trendData.length > 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-700">Тренд плану дня (%)</h3>
          <div className="mt-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#71717a" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="#71717a" />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="percent"
                  name="% плану"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  dot={{ fill: "#0ea5e9", r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function QualityStat({
  title,
  value,
  risk,
}: {
  title: string;
  value: number;
  risk?: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
      <p className="text-xs font-medium text-zinc-500">{title}</p>
      <p
        className={`mt-1 text-xl font-semibold tabular-nums ${
          risk ? "text-red-700" : "text-zinc-900"
        }`}
      >
        {formatNumber(value)}
      </p>
    </div>
  );
}
