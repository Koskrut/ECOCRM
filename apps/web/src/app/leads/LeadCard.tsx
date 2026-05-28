"use client";

import { Phone, PhoneMissed } from "lucide-react";
import type { Lead } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { isTextSelected } from "@/lib/dom";

function leadDisplayName(lead: Lead): string {
  const personName = [lead.lastName, lead.firstName, lead.middleName]
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .trim();
  return (
    personName ||
    lead.companyName ||
    lead.fullName ||
    lead.name ||
    "—"
  );
}

function leadClientLine(lead: Lead): string {
  return lead.phone || "—";
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
  const scoreText = typeof lead.score === "number" ? String(lead.score) : "—";

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
              <span title="Дзвінок сьогодні" className="inline-flex text-emerald-600">
                <Phone className="h-4 w-4" />
              </span>
            )}
            {lead.hasMissedCall && (
              <span title="Пропущений дзвінок" className="inline-flex text-red-600">
                <PhoneMissed className="h-4 w-4" />
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">{formatRelativeTime(lead.createdAt)}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge variant="lead" status={lead.status} />
      </div>

      <div className="mt-3 text-xs font-medium uppercase text-zinc-500">Бал</div>
      <div className="text-sm font-medium text-zinc-900">{scoreText}</div>

      <div className="mt-3 text-xs font-medium uppercase text-zinc-500">Клієнт</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="truncate text-sm text-zinc-900">{leadClientLine(lead)}</span>
        {lead.contactId && onOpenContact && (
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
            контакт
          </span>
        )}
      </div>

      <div className="mt-3 text-xs font-medium uppercase text-zinc-500">Відповідальний</div>
      <div className="mt-1 text-sm text-zinc-900">{lead.owner?.fullName ?? "—"}</div>
    </button>
  );
}
