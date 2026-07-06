"use client";

import Link from "next/link";
import {
  CheckSquare,
  CreditCard,
  MapPin,
  Phone,
  UserPlus,
} from "lucide-react";
import type { AgendaCompletion, AgendaSummary } from "@/lib/api/resources/daily-agenda";
import { DailyAgendaProgressBar } from "./DailyAgendaEditor";
import type { AgendaSummaryLinks } from "./agendaSummaryLinks";
import { strings } from "@/locales";

const t = strings.dailyAgenda;

type Props = {
  summary: AgendaSummary;
  profile: "office" | "field";
  date: string;
  completion?: AgendaCompletion | null;
  links?: AgendaSummaryLinks;
};

export function AgendaSummaryStrip({ summary, profile, date, completion, links }: Props) {
  const tiles = [
    {
      key: "visits" as const,
      label: t.summary.visits,
      count: summary.plan.visits || summary.scheduled.visits,
      icon: MapPin,
      show: true,
      href: links?.visits,
    },
    {
      key: "calls" as const,
      label: t.summary.calls,
      count: summary.plan.calls || summary.scheduled.contactActions,
      icon: Phone,
      show: profile === "office",
      href: links?.calls,
    },
    {
      key: "tasks" as const,
      label: t.summary.tasks,
      count: summary.plan.tasks || summary.scheduled.tasks,
      icon: CheckSquare,
      show: true,
      href: links?.tasks,
    },
    {
      key: "leads" as const,
      label: t.summary.leads,
      count: summary.plan.leads || summary.suggestions.leads || 0,
      icon: UserPlus,
      show: profile === "office",
      href: links?.leads,
    },
    {
      key: "orders" as const,
      label: t.summary.orders,
      count: summary.plan.orders || summary.suggestions.orders || 0,
      icon: CreditCard,
      show: profile === "office",
      href: links?.orders,
    },
  ].filter((tile) => tile.show);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-600">
        <span>
          {t.planCount(summary.plan.total)} · {profile === "field" ? t.profileField : t.profileOffice} · {date}
        </span>
        <Link href="/work/day-plan" className="text-xs text-sky-700 hover:underline">
          {t.dayPlanLink}
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map(({ key, label, count, icon: Icon, href }) => {
          const inner = (
            <>
              <Icon className="h-4 w-4 shrink-0 text-zinc-500" />
              <div className="min-w-0">
                <div className="text-lg font-semibold leading-none text-zinc-900">{count}</div>
                <div className="mt-0.5 truncate text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
              </div>
            </>
          );
          if (href && count > 0) {
            return (
              <Link
                key={key}
                href={href}
                className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 transition hover:border-sky-300 hover:bg-sky-50/50"
              >
                {inner}
              </Link>
            );
          }
          return (
            <div
              key={key}
              className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2"
            >
              {inner}
            </div>
          );
        })}
      </div>

      {completion ? <DailyAgendaProgressBar completion={completion} /> : null}
    </div>
  );
}

export function AgendaProfileSidebar({
  profile,
  date,
  summary,
}: {
  profile: "office" | "field";
  date: string;
  summary: AgendaSummary;
}) {
  if (profile === "field") {
    const visitCount = summary.plan.visits;
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <h3 className="text-sm font-semibold text-zinc-900">{t.sidebar.routeTitle}</h3>
        <p className="mt-1 text-sm text-zinc-600">
          {visitCount > 0 ? t.sidebar.routeVisits(visitCount) : t.sidebar.routeEmpty}
        </p>
        <Link
          href={`/visits?date=${date}`}
          className="mt-3 inline-flex text-sm font-medium text-sky-700 hover:text-sky-900 hover:underline"
        >
          {t.openRoute}
        </Link>
      </div>
    );
  }

  const queueCount = summary.suggestions.queue ?? 0;
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <h3 className="text-sm font-semibold text-zinc-900">{t.sidebar.queueTitle}</h3>
      <p className="mt-1 text-sm text-zinc-600">
        {queueCount > 0 ? t.sidebar.queueContacts(queueCount) : t.sidebar.queueEmpty}
      </p>
      <Link
        href="/work/calls/queue"
        className="mt-3 inline-flex text-sm font-medium text-sky-700 hover:text-sky-900 hover:underline"
      >
        {t.openQueue}
      </Link>
    </div>
  );
}
