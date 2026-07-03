"use client";

import Link from "next/link";
import { Check, CheckCircle2, ListTodo } from "lucide-react";
import { DateTime } from "luxon";
import type { ManagerInboxTask, ManagerInboxTasks } from "@/lib/api/resources/dashboard";
import { CRM_LOCALE, CRM_TIME_ZONE } from "@/lib/crmDatetime";
import { strings } from "@/locales";

type Props = {
  tasks: ManagerInboxTasks;
  onComplete: (id: string) => void;
};

function formatDue(dueAt: string | null): string {
  if (!dueAt) return "—";
  const d = DateTime.fromISO(dueAt, { setZone: true }).setZone(CRM_TIME_ZONE);
  if (!d.isValid) return "—";
  return d.setLocale(CRM_LOCALE).toLocaleString({
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const GROUP_META: Record<string, { dot: string; label: string; row: string }> = {
  overdue: { dot: "bg-red-500", label: "text-red-700", row: "border-red-100 bg-red-50/40" },
  today: { dot: "bg-amber-400", label: "text-amber-700", row: "border-amber-100 bg-amber-50/30" },
  tomorrow: { dot: "bg-zinc-300", label: "text-zinc-500", row: "border-zinc-100 bg-zinc-50/50" },
};

export function ManagerTasksPanel({ tasks, onComplete }: Props) {
  const t = strings.dashboard.manager.tasks;
  const total = tasks.overdue.length + tasks.today.length + tasks.tomorrow.length;

  return (
    <section className="min-w-0 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900">
        <ListTodo className="h-5 w-5 text-zinc-500" />
        {t.title}
      </h2>
      {total === 0 ? (
        <div className="mt-4 flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 py-10 text-center">
          <CheckCircle2 className="h-6 w-6 text-emerald-500" />
          <p className="mt-2 text-sm text-zinc-500">{t.empty}</p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <TaskGroup label={t.overdue} tone="overdue" tasks={tasks.overdue} onComplete={onComplete} completeLabel={t.complete} />
          <TaskGroup label={t.today} tone="today" tasks={tasks.today} onComplete={onComplete} completeLabel={t.complete} />
          <TaskGroup label={t.tomorrow} tone="tomorrow" tasks={tasks.tomorrow} onComplete={onComplete} completeLabel={t.complete} />
        </div>
      )}
    </section>
  );
}

function TaskGroup({
  label,
  tone,
  tasks,
  onComplete,
  completeLabel,
}: {
  label: string;
  tone: keyof typeof GROUP_META;
  tasks: ManagerInboxTask[];
  onComplete: (id: string) => void;
  completeLabel: string;
}) {
  if (tasks.length === 0) return null;
  const meta = GROUP_META[tone];
  return (
    <div>
      <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${meta.label}`}>
        <span className={`h-2 w-2 rounded-full ${meta.dot}`} aria-hidden />
        {label} ({tasks.length})
      </div>
      <ul className="mt-2 space-y-2">
        {tasks.map((task) => {
          const href = task.leadId
            ? `/leads?leadId=${task.leadId}`
            : task.contactId
              ? `/contacts?contactId=${task.contactId}`
              : null;
          return (
            <li
              key={task.id}
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${meta.row}`}
            >
              <div className="min-w-0 flex-1">
                {href ? (
                  <Link href={href} className="truncate text-sm font-medium text-zinc-900 hover:underline">
                    {task.title}
                  </Link>
                ) : (
                  <p className="truncate text-sm font-medium text-zinc-900">{task.title}</p>
                )}
                <p className="text-xs text-zinc-500">
                  {strings.tasks.dueLabel} {formatDue(task.dueAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onComplete(task.id)}
                title={completeLabel}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100"
              >
                <Check className="h-3.5 w-3.5" />
                {completeLabel}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
