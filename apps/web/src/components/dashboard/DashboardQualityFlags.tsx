"use client";

import Link from "next/link";
import { AlertTriangle, MapPin, NotebookPen, Timer } from "lucide-react";
import { formatNumber } from "@/app/analytics/analytics-ui";
import type { DashboardV2Quality } from "@/lib/api/resources/dashboard";
import { strings } from "@/locales";

type Props = {
  quality: DashboardV2Quality;
};

export function DashboardQualityFlags({ quality }: Props) {
  const t = strings.dashboard.leadership.qualityFlags;

  const latestDayPlan =
    quality.dayPlanTrend.length > 0
      ? quality.dayPlanTrend[quality.dayPlanTrend.length - 1]
      : null;

  const gpsGap =
    quality.visits.totalDone > 0
      ? quality.visits.totalDone -
        Math.min(quality.visits.gpsVerifiedStart, quality.visits.gpsVerifiedComplete)
      : 0;

  const flags = [
    {
      key: "withoutNote",
      title: t.withoutNote,
      value: quality.visits.withoutResultNote,
      risk: quality.visits.withoutResultNote > 0,
      href: "/analytics/visits",
      icon: NotebookPen,
    },
    {
      key: "overdueFollowUp",
      title: t.overdueFollowUp,
      value: quality.overdueFollowUps,
      risk: quality.overdueFollowUps > 0,
      href: "/contacts?workPreset=overdue",
      icon: Timer,
    },
    {
      key: "gpsGap",
      title: t.gpsGap,
      value: gpsGap,
      risk: gpsGap > 0,
      href: "/analytics/visits",
      icon: MapPin,
    },
    {
      key: "dayPlan",
      title: t.dayPlanTrend,
      value: latestDayPlan?.percent ?? null,
      risk: latestDayPlan != null && latestDayPlan.percent < 70,
      href: "/work/day-plan",
      icon: AlertTriangle,
      suffix: latestDayPlan != null ? "%" : undefined,
    },
  ];

  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">{t.title}</h2>
          <p className="mt-1 text-sm text-zinc-500">{t.subtitle}</p>
        </div>
        <Link
          href="/analytics/visits"
          className="text-sm font-medium text-sky-700 hover:text-sky-900 hover:underline"
        >
          {t.detailsLink}
        </Link>
      </div>
      <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {flags.map(({ key, title, value, risk, href, icon: Icon, suffix }) => {
          const isClear = typeof value === "number" ? value === 0 : value == null;
          return (
            <Link
              key={key}
              href={href}
              className={`block rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md ${
                risk ? "border-red-200" : "border-zinc-200"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${
                    risk ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span
                  className={`text-2xl font-semibold tabular-nums ${
                    risk ? "text-red-700" : "text-zinc-900"
                  }`}
                >
                  {value == null ? "—" : `${formatNumber(value)}${suffix ?? ""}`}
                </span>
              </div>
              <div className="mt-3 text-sm font-medium text-zinc-700">{title}</div>
              <div className={`mt-0.5 text-xs ${isClear ? "text-emerald-600" : "text-zinc-500"}`}>
                {isClear ? t.allClear : t.open}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
