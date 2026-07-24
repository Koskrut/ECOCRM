"use client";

type StatusBadgeProps = {
  variant: "lead" | "order";
  status: string;
  /** Optional override for display label; defaults to status */
  label?: string;
  /** When variant=order: prefer orderStage for display (Phase 3). If set, status prop is ignored for display. */
  orderStage?: string | null;
};

const LEAD_STATUS_MAP: Record<string, { color: string; label?: string }> = {
  NEW: { color: "bg-blue-100 text-blue-800", label: "Не оброблений" },
  IN_PROGRESS: { color: "bg-blue-100 text-blue-800", label: "В роботі" },
  WON: { color: "bg-emerald-100 text-emerald-800", label: "Успішний" },
  NOT_TARGET: { color: "bg-zinc-100 text-zinc-600", label: "Нецільовий" },
  LOST: { color: "bg-red-100 text-red-700", label: "Провалений" },
  SPAM: { color: "bg-amber-100 text-amber-800", label: "Спам" },
};

/** Phase 3: orderStage as main user-facing status. Human-readable labels. */
const ORDER_STAGE_MAP: Record<string, { color: string; label: string }> = {
  NEW: { color: "bg-blue-100 text-blue-800", label: "Новий" },
  CONFIRMED: { color: "bg-indigo-100 text-indigo-800", label: "Підтверджено" },
  AWAITING_PAYMENT: { color: "bg-amber-100 text-amber-800", label: "Очікує оплату" },
  AWAITING_STOCK: { color: "bg-violet-100 text-violet-800", label: "Очікує на склад" },
  READY_TO_SHIP: { color: "bg-amber-100 text-amber-800", label: "Готово до відправки" },
  SHIPPED: { color: "bg-sky-100 text-sky-800", label: "Відправлено" },
  AWAITING_RECEIPT: { color: "bg-amber-100 text-amber-800", label: "Очікує отримання" },
  RECEIVED: { color: "bg-emerald-100 text-emerald-800", label: "Отримано" },
  COMPLETED: { color: "bg-emerald-100 text-emerald-800", label: "Завершено" },
  CANCELED: { color: "bg-red-100 text-red-700", label: "Скасовано" },
  REFUSED: { color: "bg-red-100 text-red-700", label: "Відмова від отримання" },
  RETURN_IN_PROGRESS: { color: "bg-amber-100 text-amber-800", label: "Повернення" },
  FULLY_RETURNED: { color: "bg-amber-100 text-amber-900", label: "Повернений" },
};

/** Legacy order status (fallback when orderStage not set). */
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

export function StatusBadge({ variant, status, label: labelOverride, orderStage }: StatusBadgeProps) {
  if (variant === "lead") {
    const config = LEAD_STATUS_MAP[status] ?? { color: DEFAULT_STYLE };
    const label = labelOverride ?? config.label ?? status;
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.color}`}
      >
        {label}
      </span>
    );
  }
  // Order: prefer orderStage when provided
  const displayStatus = orderStage ?? status;
  const config =
    ORDER_STAGE_MAP[displayStatus] ?? ORDER_STATUS_MAP[displayStatus] ?? { color: DEFAULT_STYLE };
  const label = labelOverride ?? (config as { label?: string }).label ?? displayStatus;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.color}`}
    >
      {label}
    </span>
  );
}
