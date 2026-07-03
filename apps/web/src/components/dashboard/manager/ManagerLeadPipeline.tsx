"use client";

import Link from "next/link";
import { AlertTriangle, ChevronRight, Flame, GitBranch } from "lucide-react";
import type {
  ManagerHotLead,
  ManagerPipelineCounts,
} from "@/lib/api/resources/dashboard";
import { strings } from "@/locales";

type Props = {
  pipelineCounts: ManagerPipelineCounts;
  hotLeads: ManagerHotLead[];
  onOpenLead: (id: string) => void;
};

const STAGE_ORDER: (keyof ManagerPipelineCounts)[] = ["NEW", "IN_PROGRESS", "WON", "LOST"];

const STAGE_TONE: Record<keyof ManagerPipelineCounts, string> = {
  NEW: "border-sky-200 bg-sky-50/60 hover:border-sky-300 text-sky-700",
  IN_PROGRESS: "border-amber-200 bg-amber-50/60 hover:border-amber-300 text-amber-700",
  WON: "border-emerald-200 bg-emerald-50/60 hover:border-emerald-300 text-emerald-700",
  LOST: "border-zinc-200 bg-zinc-50/60 hover:border-zinc-300 text-zinc-500",
};

export function ManagerLeadPipeline({ pipelineCounts, hotLeads, onOpenLead }: Props) {
  const t = strings.dashboard.manager.pipeline;

  return (
    <section className="min-w-0 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900">
          <GitBranch className="h-5 w-5 text-zinc-500" />
          {t.title}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">{t.subtitle}</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:items-stretch">
        {STAGE_ORDER.map((stage, index) => (
          <div key={stage} className="flex items-center gap-2 sm:flex-1">
            <Link
              href={`/leads?status=${stage}`}
              className={`flex flex-1 flex-col items-center rounded-lg border px-4 py-3 transition ${STAGE_TONE[stage]}`}
            >
              <span className="text-2xl font-semibold tabular-nums">{pipelineCounts[stage]}</span>
              <span className="mt-0.5 text-xs font-medium">{t.statuses[stage]}</span>
            </Link>
            {index < STAGE_ORDER.length - 1 ? (
              <ChevronRight className="hidden h-4 w-4 shrink-0 text-zinc-300 sm:block" />
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-5">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <Flame className="h-3.5 w-3.5 text-orange-500" />
          {t.hotLeadsTitle}
        </div>
        {hotLeads.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">{t.empty}</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-100">
            {hotLeads.map((lead) => (
              <li
                key={lead.id}
                className="group flex items-center gap-3 rounded-lg px-1 py-2.5 transition hover:bg-zinc-50"
              >
                <button
                  type="button"
                  onClick={() => onOpenLead(lead.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-sm font-medium text-zinc-900">{lead.name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-400">
                    {lead.source ? (
                      <span className="inline-flex rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                        {lead.source}
                      </span>
                    ) : null}
                    <span>
                      {lead.daysSinceActivity == null
                        ? t.noActivity
                        : t.daysSinceActivity.replace("{days}", String(lead.daysSinceActivity))}
                    </span>
                    {lead.hasOverdueTask ? (
                      <span className="inline-flex items-center gap-1 font-medium text-red-600">
                        <AlertTriangle className="h-3 w-3" />
                        {t.overdueTaskFlag}
                      </span>
                    ) : null}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenLead(lead.id)}
                  className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
                >
                  {t.open}
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
