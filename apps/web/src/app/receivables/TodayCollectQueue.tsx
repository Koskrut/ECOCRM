"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { strings } from "@/locales";
import type { WorkClientRow } from "@/lib/api/resources/receivables";
import { ClientRowActions } from "./ClientRowActions";
import { formatMoney } from "./format-money";

export function TodayCollectQueue({
  items,
  overdueTotal,
  overdueCovered,
  currency,
  onOpenContact,
  onComment,
  onCopyPay,
  onRemind,
}: {
  items: WorkClientRow[];
  overdueTotal: number;
  overdueCovered: number;
  currency: string;
  onOpenContact: (id: string) => void;
  onComment: (row: WorkClientRow) => void;
  onCopyPay: (row: WorkClientRow) => void;
  onRemind?: (row: WorkClientRow) => void;
}) {
  const t = strings.receivables;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const coverPct =
    overdueTotal > 0 ? Math.round((overdueCovered / overdueTotal) * 100) : 0;

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

      {items.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">{t.todayQueueEmpty}</p>
      ) : (
        <div
          ref={scrollerRef}
          className="mt-3 flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:thin]"
        >
          {items.map((row) => (
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
              <ClientRowActions
                row={row}
                compact
                onComment={onComment}
                onCopyPay={onCopyPay}
                onRemind={onRemind}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
