import type {
  AgendaPlanItemInput,
  AgendaSuggestion,
  ScheduledContactAction,
  ScheduledTask,
  ScheduledVisit,
} from "./daily-agenda.types";
import {
  contactActionSubtitle,
  contactActionTitle,
  contactEntitySnapshot,
  taskEntitySnapshot,
  taskSubtitle,
} from "./daily-agenda.helpers";

export function visitTitle(v: ScheduledVisit): string {
  if (v.title?.trim()) return v.title.trim();
  if (v.contactName) return `Візит · ${v.contactName}`;
  if (v.companyName) return `Візит · ${v.companyName}`;
  return "Візит";
}

export function visitSubtitle(v: ScheduledVisit): string | null {
  const parts: string[] = [];
  if (v.companyName && v.contactName) parts.push(v.companyName);
  if (v.purpose) parts.push(v.purpose);
  return parts.length > 0 ? parts.join(" · ") : v.companyName;
}

export function itemSourceKey(item: {
  kind: string;
  visitId?: string | null;
  taskId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
  metadata?: unknown;
}): string {
  const meta = item.metadata as { suggestionKey?: string; orderId?: string } | null | undefined;
  if (meta?.suggestionKey) return meta.suggestionKey;
  if (item.kind === "VISIT" && item.visitId) return `VISIT:${item.visitId}`;
  if (item.kind === "TASK" && item.taskId) return `TASK:${item.taskId}`;
  if (item.kind === "CONTACT_ACTION" && item.contactId) return `CONTACT_ACTION:${item.contactId}`;
  if (item.kind === "LEAD" && item.leadId) return `LEAD:${item.leadId}`;
  if (item.kind === "SUGGESTION" && meta?.orderId) return `overdue-order:${meta.orderId}`;
  if (item.kind === "SUGGESTION" && item.contactId) return `SUGGESTION:contact:${item.contactId}`;
  if (item.kind === "SUGGESTION" && item.leadId) return `SUGGESTION:lead:${item.leadId}`;
  if (item.kind === "SUGGESTION" && item.visitId) return `SUGGESTION:visit:${item.visitId}`;
  if (item.kind === "SUGGESTION" && item.taskId) return `SUGGESTION:task:${item.taskId}`;
  return `OTHER:${item.kind}`;
}

export function buildDefaultProposal(input: {
  visits: ScheduledVisit[];
  tasks: ScheduledTask[];
  contactActions: ScheduledContactAction[];
  dateYmd: string;
}): AgendaPlanItemInput[] {
  const items: AgendaPlanItemInput[] = [];
  let position = 0;

  for (const v of input.visits) {
    items.push({
      kind: "VISIT",
      position: position++,
      visitId: v.id,
      title: visitTitle(v),
      subtitle: visitSubtitle(v),
      scheduledAt: v.startsAt,
      status: "PLANNED",
      metadata: {
        actionHref: `/visits?date=${input.dateYmd}`,
        entityHref: v.contactId ? `/contacts?open=${v.contactId}` : `/visits?date=${input.dateYmd}`,
        entitySnapshot: {
          contactName: v.contactName ?? undefined,
          companyName: v.companyName ?? undefined,
        },
      },
    });
  }

  for (const t of input.tasks) {
    items.push({
      kind: "TASK",
      position: position++,
      taskId: t.id,
      title: t.title,
      subtitle: taskSubtitle(t),
      scheduledAt: t.dueAt,
      status: "PLANNED",
      metadata: {
        actionHref: "/tasks",
        entityHref: t.contactId
          ? `/contacts?open=${t.contactId}`
          : t.leadId
            ? `/leads?open=${t.leadId}`
            : "/tasks",
        entitySnapshot: taskEntitySnapshot(t),
      },
    });
  }

  for (const c of input.contactActions) {
    items.push({
      kind: "CONTACT_ACTION",
      position: position++,
      contactId: c.contactId,
      title: contactActionTitle(c),
      subtitle: contactActionSubtitle(c),
      scheduledAt: c.nextActionAt,
      status: "PLANNED",
      metadata: {
        nextActionType: c.nextActionType,
        actionHref: `/contacts?open=${c.contactId}`,
        entityHref: `/contacts?open=${c.contactId}`,
        entitySnapshot: contactEntitySnapshot(c),
      },
    });
  }

  return items;
}

/** Seed plan from top suggestions when scheduled is sparse. */
export function buildSmartDefaultProposal(input: {
  scheduled: AgendaPlanItemInput[];
  seedSuggestions: AgendaSuggestion[];
  maxSeed?: number;
}): AgendaPlanItemInput[] {
  const maxSeed = input.maxSeed ?? 8;
  const usedKeys = new Set(input.scheduled.map((i) => itemSourceKey(i)));
  const merged = [...input.scheduled];
  let position = merged.length;

  for (const s of input.seedSuggestions) {
    if (merged.length >= input.scheduled.length + maxSeed) break;
    const key = s.suggestionKey;
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    merged.push({
      kind: s.kind,
      position: position++,
      visitId: s.visitId ?? null,
      taskId: s.taskId ?? null,
      contactId: s.contactId ?? null,
      leadId: s.leadId ?? null,
      title: s.title,
      subtitle: s.subtitle,
      scheduledAt: s.scheduledAt ?? null,
      status: "PLANNED",
      metadata: { ...s.metadata, suggestionKey: s.suggestionKey, reason: s.reason },
    });
  }

  return merged;
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
