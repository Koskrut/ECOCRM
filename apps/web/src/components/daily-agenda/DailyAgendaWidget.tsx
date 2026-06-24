"use client";

import Link from "next/link";
import { CalendarCheck, ChevronRight } from "lucide-react";
import type { DailyAgendaPayload } from "@/lib/api/resources/daily-agenda";
import { DailyAgendaProgressBar } from "./DailyAgendaEditor";
import { strings } from "@/locales";

const t = strings.dailyAgenda;

type DailyAgendaWidgetProps = {
  agenda: DailyAgendaPayload | null;
  loading: boolean;
  error: string | null;
  onCompose?: () => void;
};

export function DailyAgendaWidget({ agenda, loading, error, onCompose }: DailyAgendaWidgetProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-zinc-500">{t.loading}</p>
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

  if (!agenda) return null;

  const committed = agenda.plan?.status === "COMMITTED";
  const completion = agenda.completion;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-5 w-5 text-sky-600" />
          <h2 className="font-semibold text-zinc-900">{t.widgetTitle}</h2>
        </div>
        <Link
          href="/work/daily-agenda"
          className="inline-flex items-center gap-0.5 text-sm font-medium text-sky-700 hover:text-sky-900"
        >
          {t.openAgenda}
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {committed && completion ? (
        <DailyAgendaProgressBar completion={completion} />
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-zinc-600">{t.composeCta}</p>
          {onCompose ? (
            <button type="button" onClick={onCompose} className="btn-primary text-sm">
              {t.composeButton}
            </button>
          ) : (
            <Link href="/work/daily-agenda" className="btn-primary inline-block text-sm">
              {t.composeButton}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
