"use client";

import { ArrowRightLeft } from "lucide-react";
import { formatDateTime } from "@/lib/crmDatetime";
import type { TimelineItem } from "../types";

type Props = {
  item: TimelineItem;
};

export function StatusChangeItem({ item }: Props) {
  const meta = item.meta.kind === "status" ? item.meta.data : null;
  const fromStage = meta?.fromStage ?? meta?.fromStatus ?? null;
  const toStage = meta?.toStage ?? meta?.toStatus ?? "";
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex shrink-0 items-center pt-0.5 text-violet-600">
          <ArrowRightLeft className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-900">
            <span>Смена статуса</span>
            <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
              {fromStage ?? "—"}
            </span>
            <span className="text-xs text-zinc-400">→</span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              {toStage}
            </span>
          </div>
          {item.body ? (
            <div className="rounded bg-zinc-50 p-2 text-sm text-zinc-700 border border-zinc-100 whitespace-pre-wrap">
              {item.body}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span>{formatDateTime(item.at)}</span>
            <span>·</span>
            <span>by {item.actor.name}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
