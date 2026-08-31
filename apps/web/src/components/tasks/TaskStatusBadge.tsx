"use client";

import type { TaskStatus } from "@/lib/api/resources/tasks";
import { taskStatusLabel } from "@/lib/task-labels";

const STATUS_CLASS: Record<TaskStatus, string> = {
  OPEN: "bg-sky-100 text-sky-800",
  IN_PROGRESS: "bg-violet-100 text-violet-800",
  DONE: "bg-emerald-100 text-emerald-800",
  CANCELED: "bg-zinc-100 text-zinc-600",
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>
      {taskStatusLabel(status)}
    </span>
  );
}
