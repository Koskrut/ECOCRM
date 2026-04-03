"use client";

import type { ContactCardSummary } from "./useContactCardSummary";
import { formatDate } from "@/lib/crmDatetime";

type Props = {
  summary: ContactCardSummary;
};

const BADGE_LABELS: Record<string, string> = {
  unassigned: "Unassigned owner",
  no_company: "No linked company",
  overdue: "Overdue debt",
  debt: "Has debt",
  no_activity: "No recent activity",
  open_overdue_tasks: "Overdue tasks",
};

const BADGE_CLASSNAMES: Record<string, string> = {
  overdue: "border-red-200 bg-red-50 text-red-700",
  debt: "border-amber-200 bg-amber-50 text-amber-700",
  open_overdue_tasks: "border-orange-200 bg-orange-50 text-orange-700",
  no_activity: "border-violet-200 bg-violet-50 text-violet-700",
  unassigned: "border-blue-200 bg-blue-50 text-blue-700",
  no_company: "border-zinc-200 bg-zinc-50 text-zinc-700",
};

export function ContactCardHeader({
  summary,
}: Props) {
  const c = summary.contact;
  const lastActivity = summary.kpi.lastActivityAt ? formatDate(summary.kpi.lastActivityAt) : "—";
  const lastOrder = summary.kpi.lastOrderAt ? formatDate(summary.kpi.lastOrderAt) : "—";

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-zinc-900">{c.fullName || "Unnamed contact"}</h2>
          {c.company?.name ? <div className="mt-1 text-sm text-zinc-600">{c.company.name}</div> : null}
          <div className="mt-1 text-xs text-zinc-500">
            {[c.city, c.region].filter(Boolean).join(", ") || "Location not set"}
          </div>
        </div>
        <div className="flex max-w-[50%] flex-wrap justify-end gap-1.5">
          {(c.badges ?? []).filter((badge) => badge !== "no_company").map((badge) => (
            <span
              key={badge}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${BADGE_CLASSNAMES[badge] ?? "border-zinc-200 bg-zinc-50 text-zinc-700"}`}
            >
              {BADGE_LABELS[badge] ?? badge}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {c.status ? (
          <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-700">
            {c.status}
          </span>
        ) : null}
        {c.clientType ? (
          <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-700">
            {c.clientType}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-y-1 text-[11px] text-zinc-600">
        <div className="flex items-center gap-1.5">
          <span className="uppercase tracking-wide text-zinc-500">Last activity</span>
          <span className="font-medium text-zinc-700">{lastActivity}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="uppercase tracking-wide text-zinc-500">Last order</span>
          <span className="font-medium text-zinc-700">{lastOrder}</span>
        </div>
      </div>
    </div>
  );
}

