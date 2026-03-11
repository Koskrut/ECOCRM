"use client";

type StatusBadgeProps = {
  variant: "lead" | "order";
  status: string;
  /** Optional override for display label; defaults to status */
  label?: string;
};

const LEAD_STATUS_MAP: Record<string, { color: string; label?: string }> = {
  NEW: { color: "bg-blue-100 text-blue-800", label: "Не обработан" },
  IN_PROGRESS: { color: "bg-blue-100 text-blue-800", label: "В работе" },
  WON: { color: "bg-emerald-100 text-emerald-800", label: "Успешный" },
  NOT_TARGET: { color: "bg-zinc-100 text-zinc-600", label: "Нецелевой" },
  LOST: { color: "bg-red-100 text-red-700", label: "Проваленный" },
  SPAM: { color: "bg-amber-100 text-amber-800", label: "Спам" },
};

const ORDER_STATUS_MAP: Record<string, { color: string; label?: string }> = {
  NEW: { color: "bg-blue-100 text-blue-800", label: "NEW" },
  IN_WORK: { color: "bg-blue-100 text-blue-800", label: "IN_WORK" },
  READY_TO_SHIP: { color: "bg-amber-100 text-amber-800", label: "READY_TO_SHIP" },
  SHIPPED: { color: "bg-amber-100 text-amber-800", label: "SHIPPED" },
  CONTROL_PAYMENT: { color: "bg-amber-100 text-amber-800", label: "CONTROL_PAYMENT" },
  SUCCESS: { color: "bg-emerald-100 text-emerald-800", label: "SUCCESS" },
  RETURNING: { color: "bg-amber-100 text-amber-800", label: "RETURNING" },
  CANCELED: { color: "bg-red-100 text-red-700", label: "CANCELED" },
};

const DEFAULT_STYLE = "bg-zinc-100 text-zinc-700";

export function StatusBadge({ variant, status, label: labelOverride }: StatusBadgeProps) {
  const map = variant === "lead" ? LEAD_STATUS_MAP : ORDER_STATUS_MAP;
  const config = map[status] ?? { color: DEFAULT_STYLE };
  const label = labelOverride ?? config.label ?? status;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.color}`}
    >
      {label}
    </span>
  );
}
