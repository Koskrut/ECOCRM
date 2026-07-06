import type { AgendaEntitySnapshot, ScheduledContactAction, ScheduledTask } from "./daily-agenda.types";

const ACTION_LABELS: Record<string, string> = {
  CALL: "Дзвінок",
  MESSAGE: "Повідомлення",
  MEETING: "Зустріч",
  SEND_OFFER: "Надіслати пропозицію",
  CONTROL_PAYMENT: "Контроль оплати",
  NO_ACTION: "Без дії",
};

export function actionLabel(type: string): string {
  return ACTION_LABELS[type] ?? type;
}

export function daysBetween(dueAt: string | null, dayStart: Date): number | null {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  const diff = dayStart.getTime() - due.getTime();
  if (diff <= 0) return null;
  return Math.max(1, Math.ceil(diff / 86400000));
}

export function taskSubtitle(task: ScheduledTask): string | null {
  const parts: string[] = [];
  if (task.companyName) parts.push(task.companyName);
  if (task.contactName) parts.push(task.contactName);
  if (task.leadName) parts.push(task.leadName);
  if (task.daysOverdue != null && task.daysOverdue > 0) {
    parts.push(`прострочено ${task.daysOverdue} дн.`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function taskEntitySnapshot(task: ScheduledTask): AgendaEntitySnapshot {
  return {
    contactName: task.contactName ?? undefined,
    companyName: task.companyName ?? undefined,
    leadName: task.leadName ?? undefined,
    daysOverdue: task.daysOverdue ?? undefined,
  };
}

export function contactActionTitle(c: ScheduledContactAction): string {
  return `${actionLabel(c.nextActionType)} · ${c.fullName}`;
}

export function contactActionSubtitle(c: ScheduledContactAction): string | null {
  const parts: string[] = [];
  if (c.companyName) parts.push(c.companyName);
  if (c.phone) parts.push(c.phone);
  if (c.nextActionNote) parts.push(c.nextActionNote);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function contactEntitySnapshot(c: {
  fullName: string;
  companyName?: string | null;
  phone?: string | null;
  clientStage?: string | null;
  priorityScore?: number;
}): AgendaEntitySnapshot {
  return {
    contactName: c.fullName,
    companyName: c.companyName ?? undefined,
    phone: c.phone ?? undefined,
    clientStage: c.clientStage ?? undefined,
    priorityScore: c.priorityScore,
  };
}

export function leadDisplayName(lead: {
  lastName: string | null;
  firstName: string | null;
  middleName: string | null;
  companyName: string | null;
  fullName: string | null;
  name: string | null;
}): string {
  const personName = [lead.lastName, lead.firstName, lead.middleName]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ")
    .trim();
  return personName || lead.companyName || lead.fullName || lead.name || "—";
}
