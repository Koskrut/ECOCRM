import type { FinalOutcomePayload, MockOutcome } from "../contracts/gateway.types";
import { outcomeKeyForMock } from "./classify-reason.tool";

export function buildFinalOutcome(mockOutcome: MockOutcome): FinalOutcomePayload {
  return {
    outcomeKey: outcomeKeyForMock(mockOutcome),
    mockOutcome,
  };
}
