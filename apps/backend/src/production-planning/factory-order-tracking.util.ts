import { instantToKyivYmd, todayYmdKyiv } from "../crm-timezone";

export type FactoryLineTrackingStatus = "received" | "on_track" | "due_soon" | "overdue";

export type FactoryLineTrackingInput = {
  qtyOrdered: number;
  qtyReceived: number;
  /** Line dueAt if set; otherwise order header dueAt. */
  effectiveDueAt: Date | string;
  /** Calendar days ahead considered "due soon". Default 7. */
  dueSoonDays?: number;
  /** Today as YYYY-MM-DD in Kyiv; defaults to today. */
  todayYmd?: string;
};

/** Effective due date for a line: line.dueAt ?? order.dueAt. */
export function effectiveLineDueAt(
  lineDueAt: Date | string | null | undefined,
  orderDueAt: Date | string,
): Date {
  if (lineDueAt != null) {
    return lineDueAt instanceof Date ? lineDueAt : new Date(lineDueAt);
  }
  return orderDueAt instanceof Date ? orderDueAt : new Date(orderDueAt);
}

/**
 * Tracking status for a factory order line.
 * - received: qtyReceived >= qtyOrdered
 * - overdue: effective due < today and not fully received
 * - due_soon: due within dueSoonDays (inclusive) and not fully received
 * - on_track: otherwise
 */
export function factoryLineTrackingStatus(input: FactoryLineTrackingInput): FactoryLineTrackingStatus {
  if (input.qtyReceived >= input.qtyOrdered && input.qtyOrdered > 0) {
    return "received";
  }
  const todayYmd = input.todayYmd ?? todayYmdKyiv();
  const due =
    input.effectiveDueAt instanceof Date
      ? input.effectiveDueAt
      : new Date(input.effectiveDueAt);
  const dueYmd = instantToKyivYmd(due);
  if (dueYmd < todayYmd) return "overdue";

  const soonDays = input.dueSoonDays ?? 7;
  const dueDate = new Date(`${dueYmd}T12:00:00+03:00`);
  const todayDate = new Date(`${todayYmd}T12:00:00+03:00`);
  const diffDays = Math.round((dueDate.getTime() - todayDate.getTime()) / 86_400_000);
  if (diffDays <= soonDays) return "due_soon";
  return "on_track";
}

export function countOverdueLines(
  lines: Array<{
    qtyOrdered: number;
    qtyReceived: number;
    dueAt: Date | string | null | undefined;
  }>,
  orderDueAt: Date | string,
  todayYmd?: string,
): number {
  return lines.filter(
    (l) =>
      factoryLineTrackingStatus({
        qtyOrdered: l.qtyOrdered,
        qtyReceived: l.qtyReceived,
        effectiveDueAt: effectiveLineDueAt(l.dueAt, orderDueAt),
        todayYmd,
      }) === "overdue",
  ).length;
}

export function nearestOpenLineDueYmd(
  lines: Array<{
    qtyOrdered: number;
    qtyReceived: number;
    dueAt: Date | string | null | undefined;
  }>,
  orderDueAt: Date | string,
): string | null {
  const open = lines.filter((l) => l.qtyReceived < l.qtyOrdered);
  if (open.length === 0) return null;
  const ymds = open.map((l) => instantToKyivYmd(effectiveLineDueAt(l.dueAt, orderDueAt)));
  ymds.sort();
  return ymds[0] ?? null;
}
