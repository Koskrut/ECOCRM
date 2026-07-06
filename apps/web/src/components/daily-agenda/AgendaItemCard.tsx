"use client";

import Link from "next/link";
import { ChevronDown, ChevronUp, ExternalLink, Minus } from "lucide-react";
import type { AgendaPlanItem, AgendaPlanItemInput } from "@/lib/api/resources/daily-agenda";
import { kindConfig, scoreTone } from "./agendaKindConfig";
import { strings } from "@/locales";

const t = strings.dailyAgenda;

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

type AgendaItemCardProps = {
  item: AgendaPlanItemInput | AgendaPlanItem;
  isDone?: boolean;
  showReorder?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRemove?: () => void;
  onMarkDone?: () => void;
  onDismiss?: () => void;
  disableMoveUp?: boolean;
  disableMoveDown?: boolean;
  saving?: boolean;
  compact?: boolean;
};

export function AgendaItemCard({
  item,
  isDone = false,
  showReorder = false,
  onMoveUp,
  onMoveDown,
  onRemove,
  onMarkDone,
  onDismiss,
  disableMoveUp,
  disableMoveDown,
  saving = false,
  compact = false,
}: AgendaItemCardProps) {
  const config = kindConfig(item.kind);
  const Icon = config.icon;
  const snap = item.metadata?.entitySnapshot;
  const href = item.metadata?.entityHref ?? item.metadata?.actionHref;
  const score = snap?.priorityScore;
  const tone = score != null ? scoreTone(score) : null;
  const status = "status" in item ? item.status : item.status ?? "PLANNED";
  const done = isDone || status === "DONE";

  return (
    <div
      className={`flex items-start gap-3 text-sm ${compact ? "" : "rounded-lg border border-zinc-100 bg-white px-3 py-2.5 shadow-sm"}`}
    >
      <div
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-50 ${config.iconClass}`}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${config.badgeClass}`}>
            {config.label}
          </span>
          {item.scheduledAt ? (
            <span className="text-xs text-zinc-400">{formatTime(item.scheduledAt)}</span>
          ) : null}
          {done ? (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
              {t.done}
            </span>
          ) : null}
          {tone && score != null ? (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone.badge}`}>
              {score}
            </span>
          ) : null}
        </div>

        {href ? (
          <Link href={href} className="mt-0.5 block font-medium text-zinc-900 hover:text-sky-800 hover:underline">
            {item.title}
          </Link>
        ) : (
          <div className="mt-0.5 font-medium text-zinc-900">{item.title}</div>
        )}

        {item.subtitle ? <div className="mt-0.5 text-xs text-zinc-500">{item.subtitle}</div> : null}

        {snap?.daysOverdue != null && snap.daysOverdue > 0 ? (
          <div className="mt-1 text-xs text-red-600">{t.overdueDays(snap.daysOverdue)}</div>
        ) : null}

        {item.metadata?.reason && !item.subtitle?.includes(item.metadata.reason) ? (
          <div className="mt-1 text-xs text-zinc-400">{item.metadata.reason}</div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        {href ? (
          <Link
            href={href}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-50 hover:text-sky-700"
            aria-label={t.go}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        ) : null}

        {!done && showReorder ? (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              disabled={disableMoveUp}
              onClick={onMoveUp}
              className="rounded p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"
              aria-label={t.moveUp}
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={disableMoveDown}
              onClick={onMoveDown}
              className="rounded p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"
              aria-label={t.moveDown}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            {onRemove ? (
              <button
                type="button"
                onClick={onRemove}
                className="rounded p-1 text-red-600 hover:bg-red-50"
                aria-label={t.remove}
              >
                <Minus className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ) : null}

        {!done && onMarkDone ? (
          <button
            type="button"
            disabled={saving}
            onClick={onMarkDone}
            className="rounded-md border border-zinc-200 px-2 py-0.5 text-xs hover:bg-zinc-50 disabled:opacity-50"
          >
            {t.markDone}
          </button>
        ) : null}

        {!done && onDismiss ? (
          <button
            type="button"
            disabled={saving}
            onClick={onDismiss}
            className="text-xs text-zinc-500 hover:text-zinc-800 disabled:opacity-50"
          >
            {t.dismiss}
          </button>
        ) : null}
      </div>
    </div>
  );
}
