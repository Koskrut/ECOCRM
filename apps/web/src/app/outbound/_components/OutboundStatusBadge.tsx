"use client";

import type { OutboundAttemptStatus } from "@/lib/api/resources/outbound";

const STATUS_MAP: Record<
  OutboundAttemptStatus,
  { label: string; className: string }
> = {
  PENDING: { label: "Pending", className: "bg-zinc-100 text-zinc-600 border-zinc-200" },
  QUEUED: { label: "Queued", className: "bg-blue-50 text-blue-700 border-blue-200" },
  DIALING: {
    label: "Dialing",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  FAILED: { label: "Failed", className: "bg-red-50 text-red-700 border-red-200" },
  NO_ANSWER: {
    label: "No answer",
    className: "bg-zinc-100 text-zinc-600 border-zinc-200",
  },
  CANCELED: { label: "Canceled", className: "bg-zinc-100 text-zinc-500 border-zinc-200" },
};

export function OutboundStatusBadge({ status }: { status: OutboundAttemptStatus | string }) {
  const s = STATUS_MAP[status as OutboundAttemptStatus] ?? {
    label: status,
    className: "bg-zinc-100 text-zinc-600 border-zinc-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.className}`}
    >
      {s.label}
    </span>
  );
}
