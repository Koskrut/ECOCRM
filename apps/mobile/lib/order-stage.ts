export const MAIN_STAGE_ORDER = [
  "NEW",
  "AWAITING_PAYMENT",
  "AWAITING_STOCK",
  "CONFIRMED",
  "READY_TO_SHIP",
  "SHIPPED",
  "AWAITING_RECEIPT",
  "RECEIVED",
] as const;

export const TERMINAL_STAGES = new Set(["CANCELED", "REFUSED", "COMPLETED"]);

export const SPECIAL_STAGES = ["CANCELED", "REFUSED", "RETURN_IN_PROGRESS", "COMPLETED"] as const;

export function isForwardStageTransition(from: string, to: string): boolean {
  if (from === to) return false;
  if (to === "CANCELED") return false;
  const fromIdx = MAIN_STAGE_ORDER.indexOf(from as (typeof MAIN_STAGE_ORDER)[number]);
  const toIdx = MAIN_STAGE_ORDER.indexOf(to as (typeof MAIN_STAGE_ORDER)[number]);
  if (fromIdx >= 0 && toIdx >= 0) return toIdx > fromIdx;
  return to === "COMPLETED";
}

export function isStageTransitionBlocked(
  from: string,
  to: string,
  opts: { paymentType?: string | null; deliveryMethod?: string | null; hasTtn: boolean },
): boolean {
  if (isForwardStageTransition(from, to) && !opts.paymentType) return true;
  if (to === "CONFIRMED" && opts.deliveryMethod === "NOVA_POSHTA" && !opts.hasTtn) return true;
  return false;
}

export function getVisibleStageTargets(
  currentStage: string,
  paymentType?: string | null,
): string[] {
  const stage = currentStage || "NEW";
  if (TERMINAL_STAGES.has(stage)) return [];

  const showAwaitingPayment = paymentType === "PREPAYMENT" || stage === "AWAITING_PAYMENT";
  const mainSteps = MAIN_STAGE_ORDER.filter(
    (s) => s !== "AWAITING_PAYMENT" || showAwaitingPayment,
  );

  const currentIdx = mainSteps.indexOf(stage as (typeof MAIN_STAGE_ORDER)[number]);
  const targets: string[] = [];

  if (currentIdx >= 0) {
    for (let i = currentIdx + 1; i < mainSteps.length; i++) {
      targets.push(mainSteps[i]!);
    }
    if (stage === "RECEIVED") targets.push("COMPLETED");
  }

  const beforeShipped = new Set([
    "NEW",
    "AWAITING_PAYMENT",
    "AWAITING_STOCK",
    "CONFIRMED",
    "READY_TO_SHIP",
  ]);
  if (beforeShipped.has(stage)) targets.push("CANCELED");
  if (stage === "SHIPPED" || stage === "AWAITING_RECEIPT") targets.push("REFUSED");
  if (stage === "RECEIVED" || stage === "COMPLETED") targets.push("RETURN_IN_PROGRESS");

  return [...new Set(targets)];
}
