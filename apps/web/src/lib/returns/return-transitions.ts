import type { ReturnStatusCode } from "./return-labels";

export type ReturnTransitionSnapshot = {
  reason?: string | null;
  inboundDoneAt?: string | null;
  outboundDoneAt?: string | null;
  inboundWaivedAt?: string | null;
  outboundWaivedAt?: string | null;
};

function isMisPickReturn(reason: string | null | undefined): boolean {
  return reason === "WRONG_ITEM";
}

function isInboundDone(ret: ReturnTransitionSnapshot): boolean {
  return Boolean(ret.inboundWaivedAt || ret.inboundDoneAt);
}

function isOutboundDone(ret: ReturnTransitionSnapshot): boolean {
  return Boolean(ret.outboundWaivedAt || ret.outboundDoneAt);
}

function isMisPickChecklistComplete(ret: ReturnTransitionSnapshot): boolean {
  if (!isMisPickReturn(ret.reason)) return true;
  return isInboundDone(ret) && isOutboundDone(ret);
}

/** Mirrors backend order-return-mis-pick.utils getAllowedReturnStatusTransitions. */
export function getAllowedReturnStatusTransitions(
  current: ReturnStatusCode,
  ret: ReturnTransitionSnapshot,
): ReturnStatusCode[] {
  const base: Record<ReturnStatusCode, ReturnStatusCode[]> = {
    REQUESTED: ["APPROVED"],
    APPROVED: ["IN_TRANSIT_BACK"],
    IN_TRANSIT_BACK: ["RECEIVED_BY_WAREHOUSE"],
    RECEIVED_BY_WAREHOUSE: ["INSPECTION"],
    INSPECTION: ["REFUND_OR_ADJUSTMENT"],
    REFUND_OR_ADJUSTMENT: ["CLOSED"],
    CLOSED: [],
  };

  if (!isMisPickReturn(ret.reason)) {
    return base[current] ?? [];
  }

  if (current === "INSPECTION") {
    const next: ReturnStatusCode[] = [];
    if (isMisPickChecklistComplete(ret)) {
      if (ret.outboundWaivedAt) {
        next.push("REFUND_OR_ADJUSTMENT");
      } else {
        next.push("CLOSED");
      }
    }
    if (ret.outboundWaivedAt) {
      next.push("REFUND_OR_ADJUSTMENT");
    }
    return [...new Set(next)];
  }

  return base[current] ?? [];
}

export const WAREHOUSE_RETURN_COLUMNS: ReturnStatusCode[] = [
  "IN_TRANSIT_BACK",
  "RECEIVED_BY_WAREHOUSE",
  "INSPECTION",
];

export const WAREHOUSE_FORBIDDEN_RETURN_STATUSES: ReturnStatusCode[] = [
  "REFUND_OR_ADJUSTMENT",
  "CLOSED",
];

export const WAREHOUSE_RETURN_TRANSITIONS: Partial<
  Record<ReturnStatusCode, ReturnStatusCode[]>
> = {
  IN_TRANSIT_BACK: ["RECEIVED_BY_WAREHOUSE"],
  RECEIVED_BY_WAREHOUSE: ["INSPECTION"],
};

export function isWarehouseReturnTransitionAllowed(
  from: ReturnStatusCode,
  to: ReturnStatusCode,
): boolean {
  const allowed = WAREHOUSE_RETURN_TRANSITIONS[from];
  return allowed?.includes(to) ?? false;
}
