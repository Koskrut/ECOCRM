import type { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { CRM_TIME_ZONE, todayYmdKyiv } from "../crm-timezone";

export const TASK_ATTENTION_PRESETS = ["overdue"] as const;

export type TaskAttentionPreset = (typeof TASK_ATTENTION_PRESETS)[number];

export type TaskAssigneeScope = {
  managerId?: string;
  allowedAssigneeIds?: string[];
};

export function isTaskAttentionPreset(value: string): value is TaskAttentionPreset {
  return (TASK_ATTENTION_PRESETS as readonly string[]).includes(value);
}

/** Start of today in Kyiv (UTC instant). Tasks due before this are overdue. */
export function startOfTodayKyiv(now = new Date()): Date {
  return DateTime.fromISO(todayYmdKyiv(now), { zone: CRM_TIME_ZONE }).startOf("day").toJSDate();
}

/** OPEN/IN_PROGRESS tasks with dueAt before start of today (Kyiv). */
export function buildTaskOverdueWhere(
  scope: TaskAssigneeScope,
  now = new Date(),
): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = {
    dueAt: { not: null, lt: startOfTodayKyiv(now) },
    status: { in: ["OPEN", "IN_PROGRESS"] },
  };
  if (scope.managerId) {
    where.assigneeId = scope.managerId;
  } else if (scope.allowedAssigneeIds !== undefined) {
    where.assigneeId = { in: scope.allowedAssigneeIds };
  }
  return where;
}
