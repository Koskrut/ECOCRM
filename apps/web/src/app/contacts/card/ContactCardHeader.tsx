"use client";

import type { ContactCardSummary } from "./useContactCardSummary";

type Props = {
  summary: ContactCardSummary;
  telegramConversationId?: string | null;
  onCreateOrder: () => void;
  onOpenTasks: () => void;
  onPlanVisit: () => void;
};

const BADGE_LABELS: Record<string, string> = {
  unassigned: "Unassigned owner",
  no_company: "No linked company",
  overdue: "Overdue debt",
  debt: "Has debt",
  no_activity: "No recent activity",
  open_overdue_tasks: "Overdue tasks",
};

export function ContactCardHeader({
  summary,
  telegramConversationId,
  onCreateOrder,
  onOpenTasks,
  onPlanVisit,
}: Props) {
  const c = summary.contact;
  const telegramLink = telegramConversationId ? `/inbox/telegram?conversationId=${telegramConversationId}` : null;
  const primaryPhone = c.phones[0] ?? null;

  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">{c.fullName || "Unnamed contact"}</h2>
          <div className="mt-1 text-sm text-zinc-600">
            {c.company?.name ?? "No company"} • {c.owner?.name ?? "No owner"}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {[c.city, c.region].filter(Boolean).join(", ") || "Location not set"}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onCreateOrder}
            className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
          >
            Create order
          </button>
          <button
            type="button"
            onClick={onOpenTasks}
            className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
          >
            Create task
          </button>
          <button
            type="button"
            onClick={onPlanVisit}
            className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
          >
            Plan visit
          </button>
          <a
            href={primaryPhone ? `tel:${primaryPhone}` : undefined}
            className={`rounded-md border px-2 py-1 text-xs ${
              primaryPhone
                ? "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                : "cursor-not-allowed border-zinc-100 text-zinc-400"
            }`}
            title={primaryPhone ? "Call" : "No phone"}
          >
            Call
          </a>
          <a
            href={c.email ? `mailto:${c.email}` : undefined}
            className={`rounded-md border px-2 py-1 text-xs ${
              c.email
                ? "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                : "cursor-not-allowed border-zinc-100 text-zinc-400"
            }`}
            title={c.email ? "Email" : "No email"}
          >
            Email
          </a>
          <a
            href={telegramLink ?? undefined}
            className={`rounded-md border px-2 py-1 text-xs ${
              telegramLink
                ? "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                : "cursor-not-allowed border-zinc-100 text-zinc-400"
            }`}
            title={telegramLink ? "Telegram" : "Telegram unavailable"}
          >
            Message
          </a>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(c.badges ?? []).map((badge) => (
          <span
            key={badge}
            className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-[11px] font-medium text-zinc-700"
          >
            {BADGE_LABELS[badge] ?? badge}
          </span>
        ))}
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
    </div>
  );
}

