import type { AgendaSuggestion } from "./daily-agenda.types";
import type { AgendaPlanItemInput } from "./daily-agenda.types";

export function suggestionToPlanItem(s: AgendaSuggestion, position: number): AgendaPlanItemInput {
  return {
    kind: s.kind,
    position,
    visitId: s.visitId ?? null,
    taskId: s.taskId ?? null,
    contactId: s.contactId ?? null,
    leadId: s.leadId ?? null,
    title: s.title,
    subtitle: s.subtitle,
    scheduledAt: s.scheduledAt ?? null,
    status: "PLANNED",
    metadata: { ...s.metadata, suggestionKey: s.suggestionKey, reason: s.reason },
  };
}
