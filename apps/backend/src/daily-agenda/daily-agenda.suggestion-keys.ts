import { itemSourceKey } from "./daily-agenda.proposal";

export function planKeysFromItems(
  items: Array<{
    kind: string;
    visitId?: string | null;
    taskId?: string | null;
    contactId?: string | null;
    leadId?: string | null;
    status?: string;
    metadata?: unknown;
  }>,
): Set<string> {
  const keys = new Set<string>();
  for (const item of items) {
    if (item.status === "DISMISSED") continue;
    keys.add(itemSourceKey(item));
    const meta = item.metadata as { suggestionKey?: string; orderId?: string } | null | undefined;
    if (meta?.suggestionKey) keys.add(meta.suggestionKey);
    if (item.kind === "CONTACT_ACTION" && item.contactId) {
      keys.add(`meeting-no-visit:${item.contactId}`);
      keys.add(`call:${item.contactId}`);
      keys.add(`queue:${item.contactId}`);
      keys.add(`debt:${item.contactId}`);
    }
    if (item.kind === "TASK" && item.taskId) keys.add(`overdue-task:${item.taskId}`);
    if (item.kind === "VISIT" && item.visitId) keys.add(`backlog-visit:${item.visitId}`);
    if (item.kind === "LEAD" && item.leadId) {
      keys.add(`hot-lead:${item.leadId}`);
      keys.add(`new-lead:${item.leadId}`);
    }
    if (meta?.orderId) keys.add(`overdue-order:${meta.orderId}`);
  }
  return keys;
}
