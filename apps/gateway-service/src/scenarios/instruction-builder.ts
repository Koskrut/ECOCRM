import type { MockOutcome } from "../contracts/gateway.types";

/** Builds scenario instruction text for future OpenAI / real-time session context */
export function buildDormantReactivationInstruction(mockOutcome: MockOutcome): string {
  return [
    "Scenario: dormant lead reactivation.",
    `Target outcome hint: ${mockOutcome}.`,
    "Be concise; capture intent for CRM classification fields.",
  ].join(" ");
}
