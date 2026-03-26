import type { MockOutcome } from "../contracts/gateway.types";

const OUTCOME_KEYS: Record<MockOutcome, string> = {
  no_answer: "NO_ANSWER",
  price_issue: "PRICE_ISSUE",
  competitor: "COMPETITOR",
  catalog_requested: "CATALOG_REQUESTED",
  callback_requested: "CALLBACK_REQUESTED",
  do_not_call: "DO_NOT_CALL",
  transferred: "TRANSFER_REQUESTED",
  default: "CONTACTED",
};

export function outcomeKeyForMock(outcome: MockOutcome): string {
  return OUTCOME_KEYS[outcome] ?? OUTCOME_KEYS.default;
}
