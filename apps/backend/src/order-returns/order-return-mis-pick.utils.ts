import type { OrderStage, ReturnItemDisposition, ReturnReason } from "@prisma/client";

export type MisPickReturnSnapshot = {
  reason: ReturnReason;
  inboundDoneAt: Date | null;
  outboundDoneAt: Date | null;
  inboundWaivedAt: Date | null;
  outboundWaivedAt: Date | null;
  items: Array<{ disposition: ReturnItemDisposition }>;
};

export type MisPickReturnForSync = {
  reason: ReturnReason;
  status: string;
  outboundWaivedAt: Date | null;
  items: Array<{ qtyReturned: number; orderItemId: string }>;
};

const REPLACEMENT_SHIPPED_STAGES: OrderStage[] = [
  "SHIPPED",
  "AWAITING_RECEIPT",
  "RECEIVED",
  "COMPLETED",
];

export function isMisPickReturn(reason: ReturnReason): boolean {
  return reason === "WRONG_ITEM";
}

/** Active mis-pick with replacement path (not refund instead of replacement). */
export function isMisPickReplacementActive(ret: {
  reason: ReturnReason;
  outboundWaivedAt: Date | null;
}): boolean {
  return isMisPickReturn(ret.reason) && ret.outboundWaivedAt == null;
}

export function isInboundDone(ret: MisPickReturnSnapshot): boolean {
  if (ret.inboundWaivedAt) return true;
  if (ret.inboundDoneAt) return true;
  return false;
}

export function isOutboundDone(ret: MisPickReturnSnapshot): boolean {
  if (ret.outboundWaivedAt) return true;
  if (ret.outboundDoneAt) return true;
  return false;
}

export function isMisPickChecklistComplete(ret: MisPickReturnSnapshot): boolean {
  if (!isMisPickReturn(ret.reason)) return true;
  return isInboundDone(ret) && isOutboundDone(ret);
}

export function misPickItemsNeedDisposition(ret: {
  reason: ReturnReason;
  items: Array<{ disposition: ReturnItemDisposition }>;
}): boolean {
  if (!isMisPickReturn(ret.reason)) return false;
  return ret.items.some((it) => it.disposition === "PENDING");
}

export function replacementOrderStageIsShipped(stage: OrderStage | null | undefined): boolean {
  if (!stage) return false;
  return REPLACEMENT_SHIPPED_STAGES.includes(stage);
}

/** Returns excluded from financial / stage sync when replacement is active. */
export function shouldExcludeReturnFromOrderFinancialSync(ret: MisPickReturnForSync): boolean {
  return isMisPickReplacementActive(ret);
}

export function getAllowedReturnStatusTransitions(
  current: string,
  ret: MisPickReturnSnapshot,
): string[] {
  const base: Record<string, string[]> = {
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
    const next: string[] = [];
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

export function assertCanCloseMisPickReturn(ret: MisPickReturnSnapshot): void {
  if (!isMisPickReturn(ret.reason)) return;
  if (!isMisPickChecklistComplete(ret)) {
    throw new Error(
      "Cannot close mis-pick return: complete wrong-item return and replacement shipment first",
    );
  }
}
