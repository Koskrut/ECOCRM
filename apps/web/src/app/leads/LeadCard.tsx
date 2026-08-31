"use client";

import { Phone, PhoneMissed } from "lucide-react";
import type { Lead } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { isTextSelected } from "@/lib/dom";
import { strings } from "@/locales";
import { interpolate } from "@/lib/task-labels";
import { leadScoreTone } from "./lead-score";

const t = strings.leads;

function leadDisplayName(lead: Lead): string {
  const personName = [lead.lastName, lead.firstName, lead.middleName]
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .trim();
  return personName || lead.companyName || lead.fullName || lead.name || "—";
}

function sourceLabel(source?: string | null): string | null {
  if (!source) return null;
  return (t.sources as Record<string, string>)[source] ?? source;
}

export function LeadCard({
  lead,
  onOpen,
  onOpenContact,
}: {
  lead: Lead;
  onOpen: (leadId: string) => void;
  onOpenContact?: (contactId: string) => void;
}) {
  const title = leadDisplayName(lead);
  const hasScore = typeof lead.score === "number";
  const source = sourceLabel(lead.source);

  return (
    <button
      type="button"
      onClick={() => {
        if (isTextSelected()) return;
        onOpen(lead.id);
      }}
      className="w-full rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md active:bg-zinc-50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 font-medium text-zinc-900">
            <span className="min-w-0 truncate">{title}</span>
            {lead.hasCallToday && (
              <span title={t.callToday} className="inline-flex text-emerald-600">
                <Phone className="h-4 w-4" />
              </span>
            )}
            {lead.hasMissedCall && (
              <span title={t.callMissed} className="inline-flex text-red-600">
                <PhoneMissed className="h-4 w-4" />
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">{formatRelativeTime(lead.createdAt)}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge variant="lead" status={lead.status} />
        {hasScore && (
          <span
            title={t.scoreTooltip}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${leadScoreTone(lead.score as number)}`}
          >
            {interpolate(t.card.score, { score: lead.score as number })}
          </span>
        )}
        {source ? (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
            {source}
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
        <span className="text-xs font-medium uppercase text-zinc-400">{t.card.client}</span>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-zinc-900">{lead.phone || "—"}</span>
          {lead.contactId && onOpenContact ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onOpenContact(lead.contactId!);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenContact(lead.contactId!);
                }
              }}
              className="shrink-0 text-xs font-medium text-blue-600 underline"
            >
              {t.card.contact}
            </span>
          ) : null}
        </div>

        {lead.city ? (
          <>
            <span className="text-xs font-medium uppercase text-zinc-400">{t.columns.city}</span>
            <span className="truncate text-zinc-900">{lead.city}</span>
          </>
        ) : null}

        <span className="text-xs font-medium uppercase text-zinc-400">{t.card.owner}</span>
        <span className="truncate text-zinc-900">{lead.owner?.fullName ?? "—"}</span>
      </div>
    </button>
  );
}
