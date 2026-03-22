"use client";

import type { OutboundOutcomeBucket } from "@/lib/api/resources/outbound";
import { formatOutcomeKey } from "@/lib/api/resources/outbound";

function getBucketStyle(bucket?: OutboundOutcomeBucket): string {
  switch (bucket) {
    case "SUCCESS":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "HANDOFF":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "FAILED":
      return "bg-red-50 text-red-700 border-red-200";
    case "NEUTRAL":
      return "bg-amber-50 text-amber-700 border-amber-200";
    default:
      return "bg-zinc-100 text-zinc-500 border-zinc-200";
  }
}

export function OutcomeBadge({
  outcomeKey,
  bucket,
}: {
  outcomeKey?: string | null;
  bucket?: OutboundOutcomeBucket | string;
}) {
  if (!outcomeKey) {
    return <span className="text-xs text-zinc-400">—</span>;
  }
  const style = getBucketStyle(bucket as OutboundOutcomeBucket);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}
      title={outcomeKey}
    >
      {formatOutcomeKey(outcomeKey)}
    </span>
  );
}
