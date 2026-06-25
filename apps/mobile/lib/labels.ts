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
