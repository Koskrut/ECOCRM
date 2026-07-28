"use client";

import type { OutboundAttemptStatus } from "@/lib/api/resources/outbound";
import { OUTBOUND_STATUS_UA } from "@/lib/status-labels";

const STATUS_CLASS: Record<OutboundAttemptStatus, string> = {
  PENDING: "bg-zinc-100 text-zinc-600 border-zinc-200",
  QUEUED: "bg-blue-50 text-blue-700 border-blue-200",
  DIALING: "bg-amber-50 text-amber-700 border-amber-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  FAILED: "bg-red-50 text-red-700 border-red-200",
  NO_ANSWER: "bg-zinc-100 text-zinc-600 border-zinc-200",
  CANCELED: "bg-zinc-100 text-zinc-500 border-zinc-200",
};

export function OutboundStatusBadge({ status }: { status: OutboundAttemptStatus | string }) {
  const key = status as OutboundAttemptStatus;
  const label = OUTBOUND_STATUS_UA[key] ?? status;
  const className = STATUS_CLASS[key] ?? "bg-zinc-100 text-zinc-600 border-zinc-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}
