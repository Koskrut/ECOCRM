import type {
  AgendaSuggestion,
  DailyAgendaProfile,
  ScheduledContactAction,
  ScheduledTask,
  ScheduledVisit,
} from "./daily-agenda.types";
import { itemSourceKey } from "./daily-agenda.proposal";

export function buildSuggestions(input: {
  profile: DailyAgendaProfile;
  visits: ScheduledVisit[];
  tasks: ScheduledTask[];
  contactActions: ScheduledContactAction[];
  backlogVisits: ScheduledVisit[];
  overdueTasks: ScheduledTask[];
  queueContacts: Array<{ contactId: string; fullName: string; phone: string | null }>;
  planKeys: Set<string>;
}): AgendaSuggestion[] {
  const suggestions: AgendaSuggestion[] = [];
  const seen = new Set<string>();

  const add = (s: AgendaSuggestion) => {
    const key = s.suggestionKey;
    if (seen.has(key) || input.planKeys.has(key)) return;
    seen.add(key);
    suggestions.push(s);
  };

  const scheduledContactIds = new Set(
    input.visits
      .filter((v) => v.contactId && v.status !== "CANCELED")
      .map((v) => v.contactId as string),
  );

  for (const c of input.contactActions) {
    if (c.nextActionType === "MEETING" && !scheduledContactIds.has(c.contactId)) {
      add({
        suggestionKey: `meeting-no-visit:${c.contactId}`,
        kind: "CONTACT_ACTION",
        contactId: c.contactId,
        title: `Запланувати візит: ${c.fullName}`,
        subtitle: c.nextActionNote,
        scheduledAt: c.nextActionAt,
        reason: "Запланована зустріч без візиту на сьогодні",
        metadata: { nextActionType: "MEETING", actionHref: `/visits` },
      });
    }
    if (input.profile === "office" && c.nextActionType === "CALL") {
      add({
        suggestionKey: `call:${c.contactId}`,
        kind: "CONTACT_ACTION",
        contactId: c.contactId,
        title: `Дзвінок: ${c.fullName}`,
        subtitle: c.nextActionNote,
        scheduledAt: c.nextActionAt,
        reason: "Запланований дзвінок на сьогодні",
        metadata: { nextActionType: "CALL", actionHref: `/work/calls` },
      });
    }
  }

  for (const t of input.overdueTasks) {
    add({
      suggestionKey: `overdue-task:${t.id}`,
      kind: "TASK",
      taskId: t.id,
      title: `Прострочена задача: ${t.title}`,
      subtitle: null,
      scheduledAt: t.dueAt,
      reason: "Задача прострочена",
      metadata: { actionHref: "/tasks" },
    });
  }

  if (input.profile === "office") {
    for (const q of input.queueContacts.slice(0, 5)) {
      add({
        suggestionKey: `queue:${q.contactId}`,
        kind: "SUGGESTION",
        contactId: q.contactId,
        title: `Черга: ${q.fullName}`,
        subtitle: q.phone,
        reason: "Пріоритетний контакт з черги",
        metadata: { actionHref: "/work/calls/queue" },
      });
    }
  }

  if (input.profile === "field") {
    for (const v of input.backlogVisits) {
      add({
        suggestionKey: `backlog-visit:${v.id}`,
        kind: "VISIT",
        visitId: v.id,
        title: `Додати в маршрут: ${v.title ?? "Візит"}`,
        subtitle: v.contactName ?? v.companyName,
        reason: "Візит без часу в беклозі",
        metadata: { actionHref: "/visits" },
      });
    }
  }

  return suggestions;
}

export function planKeysFromItems(
  items: Array<{
    kind: string;
    visitId?: string | null;
    taskId?: string | null;
    contactId?: string | null;
    leadId?: string | null;
    status?: string;
  }>,
): Set<string> {
  const keys = new Set<string>();
  for (const item of items) {
    if (item.status === "DISMISSED") continue;
    keys.add(itemSourceKey(item));
    if (item.kind === "CONTACT_ACTION" && item.contactId) {
      keys.add(`meeting-no-visit:${item.contactId}`);
      keys.add(`call:${item.contactId}`);
      keys.add(`queue:${item.contactId}`);
    }
    if (item.kind === "TASK" && item.taskId) keys.add(`overdue-task:${item.taskId}`);
    if (item.kind === "VISIT" && item.visitId) keys.add(`backlog-visit:${item.visitId}`);
  }
  return keys;
}
