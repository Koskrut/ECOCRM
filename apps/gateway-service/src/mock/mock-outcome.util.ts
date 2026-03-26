import type { MockOutcome } from "../contracts/gateway.types";

const VALID: MockOutcome[] = [
  "no_answer",
  "price_issue",
  "competitor",
  "catalog_requested",
  "callback_requested",
  "do_not_call",
  "transferred",
  "default",
];

export function extractMockOutcome(
  context: Record<string, unknown>,
  crmContext: Record<string, unknown>,
): MockOutcome {
  const raw = crmContext.mockOutcome ?? context.mockOutcome;
  if (typeof raw === "string" && (VALID as string[]).includes(raw)) {
    return raw as MockOutcome;
  }
  return "default";
}
