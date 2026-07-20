import { strings } from "@/locales";

const t = strings.contacts.card;

export function getNextActionOptions() {
  return [
    { value: "", label: t.nextActionOptions.none },
    { value: "CALL", label: t.nextActionOptions.CALL },
    { value: "MESSAGE", label: t.nextActionOptions.MESSAGE },
    { value: "SEND_OFFER", label: t.nextActionOptions.SEND_OFFER },
    { value: "CONTROL_PAYMENT", label: t.nextActionOptions.CONTROL_PAYMENT },
    { value: "MEETING", label: t.nextActionOptions.MEETING },
    { value: "NO_ACTION", label: t.nextActionOptions.NO_ACTION },
  ] as const;
}

export function getClientStageOptions() {
  return [
    { value: "", label: t.stageOptions.none },
    { value: "NEW_LEAD", label: t.stageOptions.NEW_LEAD },
    { value: "IN_PROGRESS", label: t.stageOptions.IN_PROGRESS },
    { value: "WAITING_DECISION", label: t.stageOptions.WAITING_DECISION },
    { value: "ACTIVE_CLIENT", label: t.stageOptions.ACTIVE_CLIENT },
    { value: "DORMANT_CLIENT", label: t.stageOptions.DORMANT_CLIENT },
    { value: "AT_RISK", label: t.stageOptions.AT_RISK },
    { value: "PROBLEM_DEBT", label: t.stageOptions.PROBLEM_DEBT },
    { value: "LOST_CLIENT", label: t.stageOptions.LOST_CLIENT },
  ] as const;
}
