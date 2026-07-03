"use client";

import Link from "next/link";
import { ChevronRight, ListChecks, Phone, Sparkles } from "lucide-react";
import type { ContactWorkQueueItem } from "@/lib/api/resources/contacts";
import { strings } from "@/locales";

type Props = {
  items: ContactWorkQueueItem[];
  loading: boolean;
  onOpenContact: (id: string) => void;
};

function nextActionLabel(
  value: ContactWorkQueueItem["suggestion"]["suggestedNextActionType"],
): string {
  switch (value) {
    case "CALL":
      return "CALL";
    case "MESSAGE":
      return "MESSAGE";
    case "SEND_OFFER":
      return "SEND_OFFER";
    case "CONTROL_PAYMENT":
      return "CONTROL_PAYMENT";
    case "MEETING":
      return "MEETING";
    default:
      return "—";
  }
}

function scoreTone(score: number): { badge: string; bar: string } {
  if (score >= 70) return { badge: "bg-red-50 text-red-700", bar: "bg-red-500" };
  if (score >= 40) return { badge: "bg-amber-50 text-amber-700", bar: "bg-amber-400" };
  return { badge: "bg-zinc-100 text-zinc-600", bar: "bg-zinc-300" };
}

export function ManagerWorkQueueTeaser({ items, loading, onOpenContact }: Props) {
  const t = strings.dashboard.manager.queue;

  return (
    <section className="flex h-full min-w-0 flex-col rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900">
            <ListChecks className="h-5 w-5 text-zinc-500" />
            {t.title}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">{t.subtitle}</p>
        </div>
        <Link
          href="/contacts?workPreset=attention"
          className="inline-flex items-center gap-0.5 text-sm font-medium text-sky-700 hover:text-sky-900 hover:underline"
        >
          {t.viewAll}
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {loading ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-zinc-100" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-4 flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 py-10 text-center">
          <Sparkles className="h-6 w-6 text-emerald-500" />
          <p className="mt-2 text-sm text-zinc-500">{t.empty}</p>
        </div>
      ) : (
        <ul className="mt-3 -mx-1 divide-y divide-zinc-100">
          {items.map((item) => {
            const reason = item.priorityReasons[0] ?? null;
            const tone = scoreTone(item.priorityScore);
            return (
              <li
                key={item.contact.id}
                className="group flex items-center gap-3 rounded-lg px-1 py-2.5 transition hover:bg-zinc-50"
              >
                <span className="relative flex items-center">
                  <span className={`absolute -left-1 h-8 w-1 rounded-full ${tone.bar}`} aria-hidden />
                  <span
                    className={`ml-1.5 inline-flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ${tone.badge}`}
                  >
                    {item.priorityScore}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onOpenContact(item.contact.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-sm font-medium text-zinc-900">
                    {item.contact.fullName || "—"}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="inline-flex rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                      {nextActionLabel(item.suggestion.suggestedNextActionType)}
                    </span>
                    {reason ? <span className="truncate text-xs text-zinc-400">{reason}</span> : null}
                  </div>
                </button>
                {item.contact.phone ? (
                  <a
                    href={`tel:${item.contact.phone}`}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 opacity-0 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 group-hover:opacity-100"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {t.call}
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
