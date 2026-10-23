import { paymentInsideWindow } from "./marketing-time";

export type QualityKind = "QUALITY" | "JUNK";

export type QualityDecision =
  | { action: "noop" }
  | { action: "skip"; reason: string }
  | { action: "cancel"; reason: string }
  | { action: "enqueue"; kind: QualityKind; retract: boolean };

const OPEN = new Set(["NEW", "IN_PROGRESS"]);
const JUNK = new Set(["SPAM", "NOT_TARGET"]);

/**
 * One quality signal per lead. A stage change replaces it.
 * While the lead is back in work and nothing was sent, nothing goes out.
 */
export function decideQualitySignal(input: {
  countsTowardAds: boolean;
  status: string;
  lostAsJunk: boolean;
  existing: { status: string; kind: string } | null;
}): QualityDecision {
  const existing = input.existing;
  if (!input.countsTowardAds) {
    if (existing && (existing.status === "PENDING" || existing.status === "FAILED")) {
      return { action: "cancel", reason: "not_ads" };
    }
    return { action: "skip", reason: "not_ads" };
  }

  if (OPEN.has(input.status)) {
    if (existing && (existing.status === "PENDING" || existing.status === "FAILED" || existing.status === "SENT")) {
      return { action: "cancel", reason: "returned_to_work" };
    }
    return { action: "noop" };
  }

  if (input.status === "LOST" && !input.lostAsJunk) {
    if (existing?.status === "SENT") return { action: "enqueue", kind: "JUNK", retract: true };
    if (existing && (existing.status === "PENDING" || existing.status === "FAILED")) {
      return { action: "cancel", reason: "lost_not_junk" };
    }
    return { action: "skip", reason: "lost_not_junk" };
  }

  const kind: QualityKind =
    input.status === "WON" ? "QUALITY" : JUNK.has(input.status) || (input.status === "LOST" && input.lostAsJunk) ? "JUNK" : "QUALITY";

  if (input.status !== "WON" && !JUNK.has(input.status) && input.status !== "LOST") {
    return { action: "skip", reason: "status" };
  }

  if (existing?.status === "SENT" && existing.kind === kind && input.status !== "LOST") {
    return { action: "noop" };
  }
  if (existing?.status === "SENT" && existing.kind === kind && input.status === "LOST" && input.lostAsJunk) {
    return { action: "noop" };
  }

  return { action: "enqueue", kind, retract: false };
}

/** Site “new lead” goes out only with that platform’s click id. Meta forms are not sent again. */
export function decideNewLead(input: {
  countsTowardAds: boolean;
  resolvedFrom: string;
  hasClick: boolean;
  alreadyQueued: boolean;
}): "enqueue" | "skip" {
  if (input.alreadyQueued) return "skip";
  if (!input.countsTowardAds || !input.hasClick) return "skip";
  if (input.resolvedFrom === "meta_form" || input.resolvedFrom === "meta_direct") return "skip";
  return "enqueue";
}

export function decidePurchase(input: {
  sourceType: string;
  status: string;
  paidAt: Date;
  leadCreatedAt: Date;
  windowDays: number;
  alreadySent: boolean;
}): "enqueue" | "skip" {
  if (input.alreadySent) return "skip";
  if (input.status !== "COMPLETED") return "skip";
  if (input.sourceType === "CREDIT" || input.sourceType === "CREDIT_TRANSFER") return "skip";
  if (!paymentInsideWindow(input.paidAt, input.leadCreatedAt, input.windowDays)) return "skip";
  return "enqueue";
}
