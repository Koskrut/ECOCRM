"use client";

import {
  LEAD_STATUS_UA,
  ORDER_STAGE_UA,
  ORDER_STATUS_UA,
} from "@/lib/status-labels";

type StatusBadgeProps = {
  variant: "lead" | "order";
  status: string;
  /** Optional override for display label; defaults to status */
  label?: string;
  /** When variant=order: prefer orderStage for display (Phase 3). If set, status prop is ignored for display. */
  orderStage?: string | null;
};

const LEAD_STATUS_COLORS: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  WON: "bg-emerald-100 text-emerald-800",
  NOT_TARGET: "bg-zinc-100 text-zinc-600",
  LOST: "bg-red-100 text-red-700",
  SPAM: "bg-amber-100 text-amber-800",
};

const ORDER_STAGE_COLORS: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-800",
  CONFIRMED: "bg-indigo-100 text-indigo-800",
  AWAITING_PAYMENT: "bg-amber-100 text-amber-800",
  AWAITING_STOCK: "bg-violet-100 text-violet-800",
  READY_TO_SHIP: "bg-amber-100 text-amber-800",
  SHIPPED: "bg-sky-100 text-sky-800",
  AWAITING_RECEIPT: "bg-amber-100 text-amber-800",
  RECEIVED: "bg-emerald-100 text-emerald-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  CANCELED: "bg-red-100 text-red-700",
  REFUSED: "bg-red-100 text-red-700",
  RETURN_IN_PROGRESS: "bg-amber-100 text-amber-800",
  FULLY_RETURNED: "bg-amber-100 text-amber-900",
};

const ORDER_STATUS_COLORS: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-800",
  IN_WORK: "bg-blue-100 text-blue-800",
  READY_TO_SHIP: "bg-amber-100 text-amber-800",
  SHIPPED: "bg-amber-100 text-amber-800",
  CONTROL_PAYMENT: "bg-amber-100 text-amber-800",
  SUCCESS: "bg-emerald-100 text-emerald-800",
  RETURNING: "bg-amber-100 text-amber-800",
  CANCELED: "bg-red-100 text-red-700",
};

const DEFAULT_STYLE = "bg-zinc-100 text-zinc-700";

export function StatusBadge({ variant, status, label: labelOverride, orderStage }: StatusBadgeProps) {
  if (variant === "lead") {
    const color = LEAD_STATUS_COLORS[status] ?? DEFAULT_STYLE;
    const label = labelOverride ?? LEAD_STATUS_UA[status] ?? status;
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}
      >
        {label}
      </span>
    );
  }
  const displayStatus = orderStage ?? status;
  const color =
    ORDER_STAGE_COLORS[displayStatus] ??
    ORDER_STATUS_COLORS[displayStatus] ??
    DEFAULT_STYLE;
  const label =
    labelOverride ??
    ORDER_STAGE_UA[displayStatus] ??
    ORDER_STATUS_UA[displayStatus] ??
    displayStatus;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}
    >
      {label}
    </span>
  );
}
