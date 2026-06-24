import type {
  AgendaPlanItemInput,
  ScheduledContactAction,
  ScheduledTask,
  ScheduledVisit,
} from "./daily-agenda.types";

export function visitTitle(v: ScheduledVisit): string {
  if (v.title?.trim()) return v.title.trim();
  if (v.contactName) return `Візит: ${v.contactName}`;
  if (v.companyName) return `Візит: ${v.companyName}`;
  return "Візит";
}

export function contactFullName(c: ScheduledContactAction): string {
  return c.fullName;
}

export function itemSourceKey(item: {
  kind: string;
  visitId?: string | null;
  taskId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
}): string {
  if (item.kind === "VISIT" && item.visitId) return `VISIT:${item.visitId}`;
  if (item.kind === "TASK" && item.taskId) return `TASK:${item.taskId}`;
  if (item.kind === "CONTACT_ACTION" && item.contactId) return `CONTACT_ACTION:${item.contactId}`;
  if (item.kind === "LEAD" && item.leadId) return `LEAD:${item.leadId}`;
  if (item.kind === "SUGGESTION" && item.contactId) return `SUGGESTION:contact:${item.contactId}`;
  if (item.kind === "SUGGESTION" && item.leadId) return `SUGGESTION:lead:${item.leadId}`;
  if (item.kind === "SUGGESTION" && item.visitId) return `SUGGESTION:visit:${item.visitId}`;
  if (item.kind === "SUGGESTION" && item.taskId) return `SUGGESTION:task:${item.taskId}`;
  return `OTHER:${item.kind}:${Math.random()}`;
}

export function buildDefaultProposal(input: {
  visits: ScheduledVisit[];
  tasks: ScheduledTask[];
  contactActions: ScheduledContactAction[];
}): AgendaPlanItemInput[] {
  const items: AgendaPlanItemInput[] = [];
  let position = 0;

  for (const v of input.visits) {
    items.push({
      kind: "VISIT",
      position: position++,
      visitId: v.id,
      title: visitTitle(v),
      subtitle: v.purpose ?? null,
      scheduledAt: v.startsAt,
      status: "PLANNED",
      metadata: { actionHref: `/visits?date=${v.startsAt?.slice(0, 10) ?? ""}` },
    });
  }

  for (const t of input.tasks) {
    items.push({
      kind: "TASK",
      position: position++,
      taskId: t.id,
      title: t.title,
      subtitle: null,
      scheduledAt: t.dueAt,
      status: "PLANNED",
      metadata: { actionHref: "/tasks" },
    });
  }

  for (const c of input.contactActions) {
    items.push({
      kind: "CONTACT_ACTION",
      position: position++,
      contactId: c.contactId,
      title: `${c.nextActionType}: ${c.fullName}`,
      subtitle: c.nextActionNote,
      scheduledAt: c.nextActionAt,
      status: "PLANNED",
      metadata: {
        nextActionType: c.nextActionType,
        actionHref: `/contacts?open=${c.contactId}`,
      },
    });
  }

  return items;
}

export function mergeRecommitItems(
  existingDone: AgendaPlanItemInput[],
  incoming: AgendaPlanItemInput[],
): AgendaPlanItemInput[] {
  const doneKeys = new Set(existingDone.map((i) => itemSourceKey(i)));
  const merged: AgendaPlanItemInput[] = [...existingDone];
  let position = existingDone.length;

  for (const item of incoming) {
    const key = itemSourceKey(item);
    if (doneKeys.has(key)) continue;
    merged.push({ ...item, position: position++, status: item.status ?? "PLANNED" });
  }

  return merged.sort((a, b) => a.position - b.position).map((item, idx) => ({
    ...item,
    position: idx,
  }));
}
