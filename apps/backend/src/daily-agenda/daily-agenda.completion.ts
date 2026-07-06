import { dayPlanStatusFromPercent } from "../day-plan/day-plan.scoring";
import { DAY_PLAN_STATUS_THRESHOLDS } from "../day-plan/day-plan.templates";
import type {
  AgendaCompletion,
  AgendaPlanItem,
  DailyAgendaItemMetadata,
} from "./daily-agenda.types";

export function computeCompletion(
  items: Array<{ status: string }>,
): AgendaCompletion {
  const dismissedCount = items.filter((i) => i.status === "DISMISSED").length;
  const active = items.filter((i) => i.status === "PLANNED" || i.status === "DONE");
  const doneCount = active.filter((i) => i.status === "DONE").length;
  const activeCount = active.length;
  const percent =
    activeCount === 0 ? 100 : Math.round((doneCount / activeCount) * 100);
  return {
    percent,
    status: dayPlanStatusFromPercent(percent, DAY_PLAN_STATUS_THRESHOLDS),
    doneCount,
    activeCount,
    dismissedCount,
  };
}

export type CompletionFacts = {
  doneVisitIds: Set<string>;
  doneTaskIds: Set<string>;
  calledContactIds: Set<string>;
  doneVisitContactIds: Set<string>;
  contactNextActionChanged: Set<string>;
  processedLeadIds: Set<string>;
  paidOrderIds: Set<string>;
};

export function shouldAutoCompleteItem(
  item: Pick<
    AgendaPlanItem,
    "kind" | "status" | "visitId" | "taskId" | "contactId" | "leadId" | "metadata"
  >,
  facts: CompletionFacts,
): boolean {
  if (item.status !== "PLANNED") return false;

  const meta = (item.metadata ?? {}) as DailyAgendaItemMetadata;
  const nextActionType = meta.nextActionType;

  if (item.kind === "VISIT" && item.visitId) {
    return facts.doneVisitIds.has(item.visitId);
  }
  if (item.kind === "TASK" && item.taskId) {
    return facts.doneTaskIds.has(item.taskId);
  }
  if (item.kind === "LEAD" && item.leadId) {
    return facts.processedLeadIds.has(item.leadId);
  }
  if (item.kind === "CONTACT_ACTION" && item.contactId) {
    if (nextActionType === "CALL" || nextActionType === "CONTROL_PAYMENT") {
      return facts.calledContactIds.has(item.contactId);
    }
    if (nextActionType === "MEETING") {
      return (
        facts.doneVisitContactIds.has(item.contactId) ||
        facts.contactNextActionChanged.has(item.contactId)
      );
    }
    return facts.calledContactIds.has(item.contactId);
  }
  if (item.kind === "SUGGESTION") {
    if (meta.orderId) return facts.paidOrderIds.has(meta.orderId);
    if (item.contactId) return facts.calledContactIds.has(item.contactId);
    if (item.leadId) return facts.processedLeadIds.has(item.leadId);
  }

  return false;
}
