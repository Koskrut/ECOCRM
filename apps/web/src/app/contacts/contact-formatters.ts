import type {
  ContactClientStage,
  ContactExclusionCode,
  ContactNextActionType,
  ContactPriorityReasonCode,
} from "@/lib/api/resources/contacts";
import { strings } from "@/locales";

export function formatContactPriorityReason(reason: ContactPriorityReasonCode): string {
  return strings.contacts.labels.priorityReasons[reason] ?? reason;
}

export function formatContactPriorityReasonCompact(reason: ContactPriorityReasonCode): string {
  return (
    strings.contacts.labels.priorityReasonsCompact[reason] ?? formatContactPriorityReason(reason)
  );
}

export function formatContactNextActionType(
  action: ContactNextActionType | null | undefined,
): string {
  if (!action) return strings.contacts.card.nextActionOptions.none;
  return (
    strings.contacts.card.nextActionOptions[action] ?? strings.contacts.card.nextActionOptions.none
  );
}

export function formatContactClientStage(stage: ContactClientStage | null | undefined): string {
  if (!stage) return strings.contacts.card.stageOptions.none;
  return strings.contacts.card.stageOptions[stage] ?? strings.contacts.card.stageOptions.none;
}

export function formatContactExclusionReason(reason: ContactExclusionCode): string {
  return strings.contacts.labels.exclusions[reason] ?? reason;
}

export function formatDaysSinceLastContact(value: number | null): string {
  if (value == null) return strings.contacts.workQueue.noContactYet;
  return strings.contacts.workQueue.daysSince.replace("{n}", String(value));
}

export function scoreTone(score: number): string {
  if (score >= 70) return "border-red-200 bg-red-50 text-red-700";
  if (score >= 40) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

export { formatContactAddressFromGoogle } from "@/lib/contact-address.util";
