import type { OrderStage } from "@prisma/client";

/**
 * Stages where the deal rate is still a quote from order creation.
 * Confirmation snapshots the current CRM rate. A return from READY_TO_SHIP
 * (the order was already confirmed) does not reprice it.
 */
const PROVISIONAL_EXCHANGE_RATE_STAGES = new Set<OrderStage>([
  "NEW",
  "AWAITING_PAYMENT",
  "AWAITING_STOCK",
]);

const RATE_EPSILON = 1e-6;

export function shouldRefreshExchangeRateOnStageChange(
  fromStage: OrderStage | null | undefined,
  toStage: OrderStage,
): boolean {
  if (toStage !== "CONFIRMED") return false;
  const from = fromStage ?? "NEW";
  return PROVISIONAL_EXCHANGE_RATE_STAGES.has(from);
}

/** Rate to persist, or undefined when the stored rate should stay as-is. */
export function nextExchangeRateIfChanged(
  current: number | null | undefined,
  fresh: number | null,
): number | undefined {
  if (fresh == null || !Number.isFinite(fresh) || fresh <= 0) return undefined;
  if (current == null) return fresh;
  const prev = Number(current);
  if (!Number.isFinite(prev)) return fresh;
  if (Math.abs(prev - fresh) < RATE_EPSILON) return undefined;
  return fresh;
}
