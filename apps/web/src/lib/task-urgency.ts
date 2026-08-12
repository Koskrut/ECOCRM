import { DateTime } from "luxon";
import type { Task, TaskStatus } from "@/lib/api/resources/tasks";
import { CRM_TIME_ZONE } from "@/lib/crmDatetime";
import { strings } from "@/locales";

export type TaskUrgencyBucket = "overdue" | "today" | "upcoming" | "no_due" | "closed";

export function taskUrgencyBucket(task: Pick<Task, "dueAt" | "status">, now = DateTime.now()): TaskUrgencyBucket {
  if (task.status === "DONE" || task.status === "CANCELED") return "closed";
  if (!task.dueAt) return "no_due";
  const due = DateTime.fromISO(task.dueAt, { setZone: true }).setZone(CRM_TIME_ZONE);
  if (!due.isValid) return "no_due";
  const day = now.setZone(CRM_TIME_ZONE);
  if (due < day.startOf("day")) return "overdue";
  if (due <= day.endOf("day")) return "today";
  return "upcoming";
}

export function taskUrgencyLabel(bucket: TaskUrgencyBucket): string {
  return strings.tasks.urgency[bucket];
}

const URGENCY_ROW: Record<TaskUrgencyBucket, string> = {
  overdue: "border-l-4 border-l-red-500 bg-red-50/30",
  today: "border-l-4 border-l-amber-400 bg-amber-50/20",
  upcoming: "border-l-4 border-l-transparent",
  no_due: "border-l-4 border-l-zinc-200",
  closed: "border-l-4 border-l-transparent opacity-80",
};

const URGENCY_BADGE: Record<TaskUrgencyBucket, string> = {
  overdue: "bg-red-100 text-red-800",
  today: "bg-amber-100 text-amber-900",
  upcoming: "bg-zinc-100 text-zinc-700",
  no_due: "bg-zinc-100 text-zinc-500",
  closed: "bg-zinc-100 text-zinc-500",
};

export function taskUrgencyRowClass(task: Pick<Task, "dueAt" | "status">): string {
  return URGENCY_ROW[taskUrgencyBucket(task)];
}

export function taskUrgencyBadgeClass(task: Pick<Task, "dueAt" | "status">): string {
  return URGENCY_BADGE[taskUrgencyBucket(task)];
}

export function groupTasksByUrgency(tasks: Task[]): { bucket: TaskUrgencyBucket; tasks: Task[] }[] {
  const order: TaskUrgencyBucket[] = ["overdue", "today", "upcoming", "no_due", "closed"];
  const groups = new Map<TaskUrgencyBucket, Task[]>();
  for (const task of tasks) {
    const bucket = taskUrgencyBucket(task);
    const list = groups.get(bucket) ?? [];
    list.push(task);
    groups.set(bucket, list);
  }
  return order
    .filter((bucket) => (groups.get(bucket)?.length ?? 0) > 0)
    .map((bucket) => ({ bucket, tasks: groups.get(bucket)! }));
}

export function isActiveTaskStatus(status: TaskStatus): boolean {
  return status === "OPEN" || status === "IN_PROGRESS";
}
