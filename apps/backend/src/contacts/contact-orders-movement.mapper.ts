import { computePaymentStatus } from "../orders/order-payment-guards";
import {
  CONTACT_ORDER_PAYMENTS_PREVIEW_LIMIT,
  type ContactOrderMovementChild,
  type ContactOrderMovementNode,
  type ContactOrderPaymentSummary,
  type ContactOrderReturnSummary,
} from "./contact-orders-movement.types";

export type MovementReturnRow = {
  id: string;
  status: string;
  requestedAt: Date | string;
  creditAmount?: number | null;
  refundAmount?: number | null;
  replacementOrder?: { id: string; orderNumber: string } | null;
};

export type MovementPaymentRow = {
  id: string;
  amount: unknown;
  currency: string;
  sourceType: string;
  paidAt: Date | string;
  status: string;
};

export type MovementOrderRow = {
  id: string;
  orderNumber: string;
  status?: string | null;
  orderStage?: string | null;
  financialStatus?: string | null;
  totalAmount?: number | null;
  returnAdjustmentAmount?: number | null;
  paidAmount?: number | null;
  debtAmount?: number | null;
  creditAmount?: number | null;
  fxWriteOffAmount?: number | null;
  currency: string;
  exchangeRate?: number | null;
  createdAt: Date | string;
  parentOrderId?: string | null;
  parentOrder?: { id: string; orderNumber: string } | null;
  childOrders?: Array<
    MovementOrderRow & {
      returns?: MovementReturnRow[];
      payments?: MovementPaymentRow[];
    }
  >;
  returns?: MovementReturnRow[];
  payments?: MovementPaymentRow[];
};

function toIso(value: Date | string): string {
  return typeof value === "string" ? value : value.toISOString();
}

function paymentStatusOf(o: {
  totalAmount?: number | null;
  paidAmount?: number | null;
  debtAmount?: number | null;
  returnAdjustmentAmount?: number | null;
  fxWriteOffAmount?: number | null;
}): string {
  return computePaymentStatus({
    totalAmount: Number(o.totalAmount ?? 0),
    paidAmount: Number(o.paidAmount ?? 0),
    debtAmount: o.debtAmount != null ? Number(o.debtAmount) : null,
    returnAdjustmentAmount:
      o.returnAdjustmentAmount != null ? Number(o.returnAdjustmentAmount) : null,
    fxWriteOffAmount: o.fxWriteOffAmount != null ? Number(o.fxWriteOffAmount) : null,
  });
}

function mapReturn(row: MovementReturnRow): ContactOrderReturnSummary {
  return {
    id: row.id,
    status: row.status,
    requestedAt: toIso(row.requestedAt),
    creditAmount: row.creditAmount != null ? Number(row.creditAmount) : null,
    refundAmount: row.refundAmount != null ? Number(row.refundAmount) : null,
    replacementOrderId: row.replacementOrder?.id ?? null,
    replacementOrderNumber: row.replacementOrder?.orderNumber ?? null,
  };
}

function mapPayment(row: MovementPaymentRow): ContactOrderPaymentSummary {
  return {
    id: row.id,
    amount: Number(row.amount),
    currency: row.currency,
    sourceType: row.sourceType,
    paidAt: toIso(row.paidAt),
    status: row.status,
  };
}

function childCounts(child: {
  returns?: MovementReturnRow[];
  payments?: MovementPaymentRow[];
}): ContactOrderMovementChild["counts"] {
  const returns = child.returns ?? [];
  const payments = child.payments ?? [];
  return {
    returns: returns.length,
    payments: payments.length,
    openReturns: returns.filter((r) => r.status !== "CLOSED").length,
  };
}

function mapChild(
  child: MovementOrderRow & {
    returns?: MovementReturnRow[];
    payments?: MovementPaymentRow[];
  },
): ContactOrderMovementChild {
  return {
    id: child.id,
    orderNumber: child.orderNumber,
    orderStage: child.orderStage ?? null,
    totalAmount: Number(child.totalAmount ?? 0),
    paymentStatus: paymentStatusOf(child),
    currency: child.currency,
    exchangeRate: child.exchangeRate ?? null,
    counts: childCounts(child),
  };
}

export function mapContactOrderMovementNode(order: MovementOrderRow): ContactOrderMovementNode {
  const returns = order.returns ?? [];
  const payments = order.payments ?? [];
  const children = (order.childOrders ?? [])
    .slice()
    .sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return aTime - bTime;
    })
    .map(mapChild);

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status ?? null,
    orderStage: order.orderStage ?? null,
    financialStatus: order.financialStatus ?? null,
    paymentStatus: paymentStatusOf(order),
    totalAmount: Number(order.totalAmount ?? 0),
    returnAdjustmentAmount: Number(order.returnAdjustmentAmount ?? 0),
    paidAmount: Number(order.paidAmount ?? 0),
    debtAmount: Number(order.debtAmount ?? 0),
    creditAmount: Number(order.creditAmount ?? 0),
    currency: order.currency,
    exchangeRate: order.exchangeRate ?? null,
    createdAt: toIso(order.createdAt),
    parentOrderId: order.parentOrderId ?? null,
    parent: order.parentOrder
      ? { id: order.parentOrder.id, orderNumber: order.parentOrder.orderNumber }
      : null,
    children,
    returnsSummary: returns.map(mapReturn),
    paymentsSummary: payments.slice(0, CONTACT_ORDER_PAYMENTS_PREVIEW_LIMIT).map(mapPayment),
    counts: {
      children: children.length,
      returns: returns.length,
      payments: payments.length,
      openReturns: returns.filter((r) => r.status !== "CLOSED").length,
    },
  };
}

export function selectRootMovementOrders<T extends { id: string; parentOrderId?: string | null }>(
  orders: T[],
): T[] {
  const idSet = new Set(orders.map((o) => o.id));
  return orders.filter((o) => !o.parentOrderId || !idSet.has(o.parentOrderId));
}
