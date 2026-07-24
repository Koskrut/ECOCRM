export type ReturnCoverage = "NONE" | "PARTIAL" | "FULL";

type CoverageOrderItem = { id: string; qty: number };
type CoverageReturnItem = { orderItemId: string; qtyReturned: number };

/**
 * Cumulative qty return coverage for an order (all returns, open + closed).
 * FULL = every ordered qty>0 item has returned >= qty and at least one return > 0.
 */
export function computeReturnCoverage(
  orderItems: CoverageOrderItem[],
  returnItems: CoverageReturnItem[],
): ReturnCoverage {
  const relevant = orderItems.filter((i) => Number(i.qty) > 0);
  if (relevant.length === 0) return "NONE";

  const returnedByItem = new Map<string, number>();
  for (const ri of returnItems) {
    const qty = Math.max(0, Number(ri.qtyReturned) || 0);
    if (qty <= 0) continue;
    returnedByItem.set(ri.orderItemId, (returnedByItem.get(ri.orderItemId) ?? 0) + qty);
  }

  let anyReturned = false;
  let allFullyReturned = true;
  for (const item of relevant) {
    const returned = returnedByItem.get(item.id) ?? 0;
    if (returned > 0) anyReturned = true;
    if (returned < Number(item.qty)) allFullyReturned = false;
  }

  if (!anyReturned) return "NONE";
  if (allFullyReturned) return "FULL";
  return "PARTIAL";
}
