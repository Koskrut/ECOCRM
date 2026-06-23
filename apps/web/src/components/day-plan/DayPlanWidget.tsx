"use client";

import Link from "next/link";
import { CheckCircle2, ChevronRight, Target } from "lucide-react";
import type { DayPlanItem, DayPlanPayload, DayPlanStatus } from "@/lib/api/resources/day-plan";
import { strings } from "@/locales";

const w = strings.dayPlan.widget;

function statusBarClass(status: DayPlanStatus): string {
  if (status === "green") return "bg-emerald-500";
  if (status === "yellow") return "bg-amber-400";
  return "bg-red-500";
}

function statusTextClass(status: DayPlanStatus): string {
  if (status === "green") return "text-emerald-700";
  if (status === "yellow") return "text-amber-700";
  return "text-red-700";
}

function formatPlanFact(item: DayPlanItem): string {
  if (item.kind === "zero_target") {
    return item.fact === 0 ? w.overdueZero : w.overdueCount(item.fact);
  }
  if (item.key === "leads_new_processed" || item.key === "tasks_due_today_done") {
    return `${item.fact} / ${item.plan}`;
  }
  if (item.key === "field_shift_started") {
    return item.fact >= 1 ? w.yes : w.no;
  }
  return `${item.fact} / ${item.plan}`;
}

type DayPlanWidgetProps = {
  plan: DayPlanPayload | null;
  loading: boolean;
  error: string | null;
  detailHref?: string;
};

export function DayPlanWidget({ plan, loading, error, detailHref = "/work/day-plan" }: DayPlanWidgetProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-zinc-500">{w.loading}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }

  if (!plan) return null;

  const weakest = [...plan.items].sort((a, b) => a.percent - b.percent).slice(0, 3);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
            <Target className="h-4 w-4" />
            {w.title}
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            {plan.profile === "field" ? w.profileField : w.profileOffice} · {plan.date}
          </p>
        </div>
        <Link
          href={detailHref}
          className="inline-flex items-center gap-1 text-sm font-medium text-zinc-600 hover:text-zinc-900"
        >
          {w.openPlan}
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div
          className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 ${
            plan.status === "green"
              ? "border-emerald-200 bg-emerald-50"
              : plan.status === "yellow"
                ? "border-amber-200 bg-amber-50"
                : "border-red-200 bg-red-50"
          }`}
        >
          <span className={`text-lg font-bold tabular-nums ${statusTextClass(plan.status)}`}>
            {plan.overallPercent}%
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
            <div
              className={`h-full rounded-full transition-all ${statusBarClass(plan.status)}`}
              style={{ width: `${plan.overallPercent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            {w.statusLegend}
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {weakest.map((item) => (
          <li
            key={item.key}
            className="flex items-center justify-between gap-2 rounded-md border border-zinc-100 bg-zinc-50/60 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-900">{item.label}</p>
              <p className="text-xs text-zinc-500">{formatPlanFact(item)}</p>
            </div>
            <span
              className={`shrink-0 text-sm font-semibold tabular-nums ${
                item.percent >= 80
                  ? "text-emerald-700"
                  : item.percent >= 50
                    ? "text-amber-700"
                    : "text-red-700"
              }`}
            >
              {item.percent}%
            </span>
          </li>
        ))}
      </ul>

      {plan.overallPercent >= 80 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {w.progressGood}
        </p>
      )}
    </div>
  );
}

export function DayPlanPercentBadge({
  percent,
  status,
}: {
  percent: number;
  status: DayPlanStatus;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
        status === "green"
          ? "bg-emerald-100 text-emerald-800"
          : status === "yellow"
            ? "bg-amber-100 text-amber-800"
            : "bg-red-100 text-red-800"
      }`}
    >
      {percent}%
    </span>
  );
}
