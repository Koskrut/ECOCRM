"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, X } from "lucide-react";
import { strings } from "@/locales";
import type { ReceivablesSnoozeDays, WorkClientRow } from "@/lib/api/resources/receivables";
import { formatDate } from "@/lib/crmDatetime";
import { ClientRowActions } from "./ClientRowActions";
import { formatMoney } from "./format-money";

const SNOOZE_PRESETS: ReceivablesSnoozeDays[] = [1, 3, 7];

function snoozePresetLabel(days: ReceivablesSnoozeDays, t: typeof strings.receivables): string {
  if (days === 1) return t.snooze1d;
  if (days === 3) return t.snooze3d;
  return t.snooze7d;
}

export function TodayCollectQueue({
  items,
  overdueTotal,
  overdueCovered,
  currency,
  snoozedCount,
  snoozedItems,
  onOpenContact,
  onComment,
  onCopyPay,
  onRemind,
  onSnooze,
  onUnsnooze,
}: {
  items: WorkClientRow[];
  overdueTotal: number;
  overdueCovered: number;
  currency: string;
  snoozedCount: number;
  snoozedItems: WorkClientRow[];
  onOpenContact: (id: string) => void;
  onComment: (row: WorkClientRow) => void;
  onCopyPay: (row: WorkClientRow) => void;
  onRemind?: (row: WorkClientRow) => void;
  onSnooze: (row: WorkClientRow, days: ReceivablesSnoozeDays) => void;
  onUnsnooze: (row: WorkClientRow) => void;
}) {
  const t = strings.receivables;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [snoozeForId, setSnoozeForId] = useState<string | null>(null);
  const [showSnoozed, setShowSnoozed] = useState(false);
  const coverPct = overdueTotal > 0 ? Math.round((overdueCovered / overdueTotal) * 100) : 0;

  const scrollBy = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 240, behavior: "smooth" });
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-sm font-semibold text-zinc-900">{t.todayQueueTitle}</h2>
          {items.length > 0 && overdueTotal > 0 ? (
            <p className="text-xs text-zinc-500">{t.todayQueuePareto(items.length, coverPct)}</p>
          ) : null}
          {snoozedCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowSnoozed((v) => !v)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
                showSnoozed
                  ? "bg-zinc-800 text-white ring-zinc-800"
                  : "bg-zinc-100 text-zinc-700 ring-zinc-200 hover:bg-zinc-200"
              }`}
            >
              {t.snoozedChip(snoozedCount)}
            </button>
          ) : null}
        </div>
        {items.length > 3 ? (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
              aria-label="Scroll left"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollBy(1)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
              aria-label="Scroll right"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>

      {showSnoozed && snoozedCount > 0 ? (
        <ul className="mt-3 space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2">
          {snoozedItems.length === 0 ? (
            <li className="px-2 py-1 text-xs text-zinc-500">{t.snoozedChip(snoozedCount)}</li>
          ) : (
            snoozedItems.map((row) => (
              <li
                key={row.contactId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white px-2.5 py-2 text-sm"
              >
                <div className="min-w-0">
                  <button
                    type="button"
                    className="truncate font-medium text-zinc-900 underline-offset-2 hover:underline"
                    onClick={() => onOpenContact(row.contactId)}
                  >
                    {row.clientName}
                  </button>
                  <div className="text-xs text-zinc-500">
                    {row.snoozedUntil ? t.snoozedUntil(formatDate(row.snoozedUntil)) : null}
                    {row.snoozedByName ? ` · ${row.snoozedByName}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onUnsnooze(row)}
                  className="shrink-0 rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  {t.unsnooze}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}

      {items.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">{t.todayQueueEmpty}</p>
      ) : (
        <div
          ref={scrollerRef}
          className="mt-3 flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:thin]"
        >
          {items.map((row) => {
            const snoozing = snoozeForId === row.contactId;
            return (
              <div
                key={row.contactId}
                className="flex w-[240px] shrink-0 snap-start flex-col gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5"
              >
                <button
                  type="button"
                  className="truncate text-left text-sm font-medium text-zinc-900 underline-offset-2 hover:underline"
                  onClick={() => onOpenContact(row.contactId)}
                  title={row.clientName}
                >
                  {row.clientName}
                </button>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-600">
                  <span className="font-semibold tabular-nums text-red-700">
                    {formatMoney(row.overdueAmount || row.debtAmount, currency)}
                  </span>
                  {row.overdueDays ? <span>{t.overdueDaysShort(row.overdueDays)}</span> : null}
                  {row.promiseDate ? (
                    <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-amber-800 ring-1 ring-amber-200">
                      {row.promiseDate}
                    </span>
                  ) : null}
                </div>
                {row.lastCommentPreview ? (
                  <p className="line-clamp-1 text-xs text-zinc-500">{row.lastCommentPreview}</p>
                ) : (
                  <p className="text-xs text-amber-700">{t.commentNone}</p>
                )}
                {snoozing ? (
                  <div className="flex flex-wrap items-center gap-1">
                    {SNOOZE_PRESETS.map((days) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => {
                          setSnoozeForId(null);
                          onSnooze(row, days);
                        }}
                        className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100"
                      >
                        {snoozePresetLabel(days, t)}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setSnoozeForId(null)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50"
                      aria-label={t.filtersClose}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-1">
                    <ClientRowActions
                      row={row}
                      compact
                      onComment={onComment}
                      onCopyPay={onCopyPay}
                      onRemind={onRemind}
                    />
                    <button
                      type="button"
                      onClick={() => setSnoozeForId(row.contactId)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                      title={t.snoozeAction}
                      aria-label={t.snoozeAction}
                    >
                      <Clock className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
