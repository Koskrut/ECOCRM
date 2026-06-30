import { strings } from "@/locales";
import type { TaskStatus, TaskStatusFilter } from "@/lib/api/resources/tasks";

const t = strings.tasks;

export function taskStatusLabel(status: TaskStatus): string {
  switch (status) {
    case "OPEN":
      return t.status.open;
    case "IN_PROGRESS":
      return t.status.inProgress;
    case "DONE":
      return t.status.done;
    case "CANCELED":
      return t.status.canceled;
    default:
      return status;
  }
}

export function taskStatusFilterLabel(filter: TaskStatusFilter): string {
  switch (filter) {
    case "active":
      return t.status.active;
    case "OPEN":
      return t.status.open;
    case "IN_PROGRESS":
      return t.status.inProgress;
    case "DONE":
      return t.status.done;
    case "CANCELED":
      return t.status.canceled;
    case "all":
      return t.status.all;
    default:
      return filter;
  }
}

export function taskLinkedTypeLabel(type: "contact" | "company" | "lead" | "order"): string {
  return t.linkedTo[type];
}

export function interpolate(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replace(`{${key}}`, String(value)),
    template,
  );
}
