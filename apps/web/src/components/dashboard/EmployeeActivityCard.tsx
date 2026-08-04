"use client";

import { ChevronRight } from "lucide-react";
import type { EmployeeDailyActivityRow } from "@/lib/api/resources/dashboard";
import { strings } from "@/locales";

type Props = {
  row: EmployeeDailyActivityRow;
  formatDuration: (seconds: number) => string;
  formatKyivTime: (iso: string | null) => string;
  onOpenTimeline: () => void;
};

function formatPaymentSummary(row: EmployeeDailyActivityRow): string {
  const parts = Object.entries(row.payments.amountsByCurrency)
    .filter(([, v]) => v > 0)
    .map(([cur, v]) => `${v.toLocaleString("uk-UA", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${cur}`);
  const amounts = parts.length > 0 ? parts.join(", ") : "0";
  return `${row.payments.count} / ${amounts} по ${row.payments.uniqueOrders} замовленнях`;
}

function formatOrdersSummary(row: EmployeeDailyActivityRow): string {
  const parts: string[] = [];
  if (row.orders.createdCount > 0) {
    const preview = row.orders.previews.find((p) => p.kind === "created");
    if (preview) {
      parts.push(
        `+${row.orders.createdCount} новий (#${preview.orderNumber} ${preview.clientName ?? "—"} ${preview.amount} ${preview.currency})`,
      );
    } else {
      parts.push(`+${row.orders.createdCount} нових`);
    }
  }
  if (row.orders.statusChangedCount > 0) {
    parts.push(`${row.orders.statusChangedCount} зміна стадії`);
  }
  return parts.length > 0 ? parts.join(", ") : "—";
}

function formatTasksSummary(row: EmployeeDailyActivityRow): string {
  const t = strings.dashboard.employeeActivity;
  if (row.tasks.completed === 0 && row.tasks.created === 0) return "—";
  const extras: string[] = [];
  if (row.tasks.byTitleGroup.paymentControl > 0) extras.push(t.taskPaymentControl);
  if (row.tasks.byTitleGroup.callback > 0) extras.push(t.taskCallback);
  const suffix = extras.length > 0 ? ` (${t.including} ${extras.join(", ")})` : "";
  return `${t.closed} ${row.tasks.completed}${row.tasks.created > 0 ? `, ${t.created} ${row.tasks.created}` : ""}${suffix}`;
}

function formatCrmSummary(row: EmployeeDailyActivityRow): string {
  const total =
    row.crm.contacts + row.crm.companies + row.crm.leads + row.crm.visits + row.crm.activities;
  return String(total);
}

function presenceLabel(row: EmployeeDailyActivityRow, formatDuration: (s: number) => string, formatKyivTime: (iso: string | null) => string): string {
  const t = strings.dashboard.employeeActivity.presence;
  if (row.presence.status === "online") {
    const range =
      row.presence.firstAt && row.presence.lastAt
        ? ` (${formatKyivTime(row.presence.firstAt)}–${formatKyivTime(row.presence.lastAt)})`
        : "";
    return `${t.online} ${formatDuration(row.presence.activeSeconds)}${range}`;
  }
  if (row.presence.status === "was_today") {
    const range =
      row.presence.firstAt && row.presence.lastAt
        ? ` (${formatKyivTime(row.presence.firstAt)}–${formatKyivTime(row.presence.lastAt)})`
        : "";
    return `${formatDuration(row.presence.activeSeconds)}${range}`;
  }
  return t.absent;
}

export function EmployeeActivityCard({
  row,
  formatDuration,
  formatKyivTime,
  onOpenTimeline,
}: Props) {
  const t = strings.dashboard.employeeActivity;
  const ttn =
    row.shipping.ttnNumbers.length > 0
      ? row.shipping.ttnNumbers.join(", ")
      : row.shipping.ttnCount > 0
        ? String(row.shipping.ttnCount)
        : null;

  return (
    <button
      type="button"
      onClick={onOpenTimeline}
      className="group w-full rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-zinc-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5 text-sm text-zinc-700">
          <p className="font-semibold text-zinc-900">
            {row.fullName}
            <span className="ml-2 font-normal text-zinc-500">— {presenceLabel(row, formatDuration, formatKyivTime)}</span>
          </p>
          <p>
            <span className="text-zinc-500">{t.payments}:</span> {formatPaymentSummary(row)}
            {row.payments.matchAudits > 0 ? ` · ${t.matchAudits} ${row.payments.matchAudits}` : ""}
          </p>
          <p>
            <span className="text-zinc-500">{t.orders}:</span> {formatOrdersSummary(row)}
            {ttn ? `, ${t.ttn} ${ttn}` : ""}
          </p>
          <p>
            <span className="text-zinc-500">{t.tasks}:</span> {formatTasksSummary(row)}
          </p>
          <p>
            <span className="text-zinc-500">{t.crm}:</span> {formatCrmSummary(row)}
          </p>
        </div>
        <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-zinc-400 group-hover:text-zinc-600" />
      </div>
    </button>
  );
}
