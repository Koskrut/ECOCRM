import type { MockOutcome } from "../contracts/gateway.types";

export interface OutcomeFixtures {
  transcript: string;
  summary: string;
  classificationFields: Record<string, unknown>;
}

export function getOutcomeFixtures(outcome: MockOutcome): OutcomeFixtures {
  switch (outcome) {
    case "no_answer":
      return {
        transcript: "",
        summary: "No answer",
        classificationFields: { reason: "no_answer" },
      };
    case "price_issue":
      return {
        transcript: "Customer says price is too high compared to competitor offer.",
        summary: "Lead raised price sensitivity; competitor mentioned.",
        classificationFields: { concern: "price", competitorMentioned: true },
      };
    case "competitor":
      return {
        transcript: "Customer is comparing with Brand X.",
        summary: "Strong competitor alternative in consideration.",
        classificationFields: { competitor: "Brand X" },
      };
    case "catalog_requested":
      return {
        transcript: "Please send the full catalog to my email.",
        summary: "Requested product catalog.",
        classificationFields: { intent: "catalog", channel: "email" },
      };
    case "callback_requested":
      return {
        transcript: "Call me back tomorrow afternoon.",
        summary: "Callback window: tomorrow PM.",
        classificationFields: { intent: "callback", window: "tomorrow_pm" },
      };
    case "do_not_call":
      return {
        transcript: "Stop calling this number.",
        summary: "Explicit do-not-call request.",
        classificationFields: { dnc: true },
      };
    case "transferred":
      return {
        transcript: "Please connect me to a manager.",
        summary: "Transfer to human agent requested.",
        classificationFields: { intent: "transfer" },
      };
    default:
      return {
        transcript: "Short qualification call completed.",
        summary: "Standard dormant reactivation touchpoint.",
        classificationFields: { intent: "reactivation" },
      };
  }
}
