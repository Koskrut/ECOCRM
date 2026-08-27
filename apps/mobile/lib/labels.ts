import { t } from "@/lib/i18n";

export function gpsVerificationLabel(code: string | null | undefined): string {
  if (!code) return "";
  const key = `gps.${code}` as const;
  const label = t(key);
  return label === key ? code : label;
}

export const VISIT_OUTCOMES = [
  "SUCCESS",
  "FOLLOW_UP",
  "NO_DECISION",
  "NOT_RELEVANT",
  "FAILED",
] as const;

export type VisitOutcome = (typeof VISIT_OUTCOMES)[number];

export function visitOutcomeLabel(o: VisitOutcome): string {
  const key = `outcomes.${o}` as const;
  const label = t(key);
  return label === key ? o : label;
}

export function orderStageLabel(stage: string | null | undefined): string {
  if (!stage) return "";
  const key = `orderStage.${stage}` as const;
  const label = t(key);
  return label === key ? stage : label;
}

export function clientStageLabel(stage: string | null | undefined): string {
  if (!stage) return "";
  const key = `clientStage.${stage}` as const;
  const label = t(key);
  return label === key ? stage : label;
}

export const CALL_OUTCOMES = [
  "NO_ANSWER",
  "BUSY",
  "WRONG_NUMBER",
  "GATEKEEPER",
  "NOT_INTERESTED",
  "INTERESTED",
  "REQUESTED_OFFER",
  "REQUESTED_CALLBACK",
  "MEETING_SCHEDULED",
  "CONVERTED",
] as const;

export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export function callOutcomeLabel(o: CallOutcome): string {
  const key = `callOutcome.${o}` as const;
  const label = t(key);
  return label === key ? o : label;
}

export function visitStatusLabel(status: string | null | undefined): string {
  if (!status) return "";
  const key = `visitStatus.${status}` as const;
  const label = t(key);
  return label === key ? status : label;
}

export function leadStatusLabel(status: string | null | undefined): string {
  if (!status) return "";
  const key = `leadStatus.${status}` as const;
  const label = t(key);
  return label === key ? status : label;
}

export function workQueuePresetLabel(preset: string): string {
  const key = `workQueue.${preset}` as const;
  const label = t(key);
  return label === key ? preset : label;
}
