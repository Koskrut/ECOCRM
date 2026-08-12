import type { TaskStatus } from "@prisma/client";
import { DateTime } from "luxon";
import { CRM_TIME_ZONE, todayYmdKyiv } from "../crm-timezone";

export type TaskPrioritySortRow = {
  id: string;
  dueAt: Date | null;
  status: TaskStatus;
  createdAt: Date;
};

/** Urgency bucket: lower = work first. */
export type TaskUrgencyBucket = "overdue" | "today" | "upcoming" | "no_due" | "closed";

export function startOfTodayKyiv(now = new Date()): Date {
  return DateTime.fromISO(todayYmdKyiv(now), { zone: CRM_TIME_ZONE }).startOf("day").toJSDate();
}

export function endOfTodayKyiv(now = new Date()): Date {
  return DateTime.fromISO(todayYmdKyiv(now), { zone: CRM_TIME_ZONE }).endOf("day").toJSDate();
}

export function taskUrgencyBucket(
  row: Pick<TaskPrioritySortRow, "dueAt" | "status">,
  now = new Date(),
): TaskUrgencyBucket {
  if (row.status === "DONE" || row.status === "CANCELED") return "closed";
  if (!row.dueAt) return "no_due";
  const due = row.dueAt.getTime();
  const start = startOfTodayKyiv(now).getTime();
  const end = endOfTodayKyiv(now).getTime();
  if (due < start) return "overdue";
  if (due <= end) return "today";
  return "upcoming";
}

const BUCKET_ORDER: Record<TaskUrgencyBucket, number> = {
  overdue: 0,
  today: 1,
  upcoming: 2,
  no_due: 3,
  closed: 4,
};

const STATUS_ORDER: Partial<Record<TaskStatus, number>> = {
  OPEN: 0,
  IN_PROGRESS: 1,
  DONE: 2,
  CANCELED: 3,
};

/** Smart inbox order: overdue → today → upcoming → no date; OPEN before IN_PROGRESS. */
export function compareTasksByPriority(
  a: TaskPrioritySortRow,
  b: TaskPrioritySortRow,
  now = new Date(),
): number {
  const bucketDiff = BUCKET_ORDER[taskUrgencyBucket(a, now)] - BUCKET_ORDER[taskUrgencyBucket(b, now)];
  if (bucketDiff !== 0) return bucketDiff;

  const statusDiff = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
  if (statusDiff !== 0) return statusDiff;

  if (a.dueAt && b.dueAt) {
    const dueDiff = a.dueAt.getTime() - b.dueAt.getTime();
    if (dueDiff !== 0) return dueDiff;
  } else if (a.dueAt && !b.dueAt) {
    return -1;
  } else if (!a.dueAt && b.dueAt) {
    return 1;
  }

  return b.createdAt.getTime() - a.createdAt.getTime();
}

export function sortTasksByPriority<T extends TaskPrioritySortRow>(rows: T[], now = new Date()): T[] {
  return [...rows].sort((a, b) => compareTasksByPriority(a, b, now));
}
