/** Stages that count toward CRM receivables — mirrors backend RECEIVABLES_DEBT_ORDER_STAGES. */
export const OPERATIONAL_DEBT_ORDER_STAGES = [
  "READY_TO_SHIP",
  "SHIPPED",
  "AWAITING_RECEIPT",
  "RECEIVED",
  "COMPLETED",
  "RETURN_IN_PROGRESS",
  "FULLY_RETURNED",
] as const;

export type OrderUnpaidKind = "none" | "due" | "debt";

export function isOperationalDebtOrder(order: {
  orderStage?: string | null;
  legacySource?: string | null;
}): boolean {
  if (order.legacySource === "bitrix") return false;
  return (
    order.orderStage != null &&
    (OPERATIONAL_DEBT_ORDER_STAGES as readonly string[]).includes(order.orderStage)
  );
}

export function isOrderFinancialOverdue(financialStatus?: string | null): boolean {
  return financialStatus === "OVERDUE";
}

/** Unpaid balance label: pipeline «до оплати» vs receivables «борг». */
export function orderUnpaidKind(
  order: {
    orderStage?: string | null;
    legacySource?: string | null;
    financialStatus?: string | null;
  },
  debtAmount: number,
): OrderUnpaidKind {
  if (!(debtAmount > 0.009)) return "none";
  return isOperationalDebtOrder(order) ? "debt" : "due";
}

export function orderUnpaidAmountClassName(
  order: {
    orderStage?: string | null;
    legacySource?: string | null;
    financialStatus?: string | null;
  },
  debtAmount: number,
): string {
  const kind = orderUnpaidKind(order, debtAmount);
  if (kind === "none") return "tabular-nums text-zinc-600";
  if (isOrderFinancialOverdue(order.financialStatus)) {
    return "font-medium tabular-nums text-red-700";
  }
  if (kind === "debt") return "font-medium tabular-nums text-amber-700";
  return "font-medium tabular-nums text-zinc-600";
}
