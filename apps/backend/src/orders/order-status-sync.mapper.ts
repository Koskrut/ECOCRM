/**
 * Phase 1: Maps legacy OrderStatus to new order model fields (orderStage, deliveryStatus, financialStatus).
 * Used for backfill and dual-write so new fields stay in sync when status is written by API, NP, or Bitrix.
 *
 * Phase 7 — Legacy status deprecated:
 * - Order.status is optional; no longer written by orders, returns, NP, or Bitrix.
 * - Only OrderStatusHistory still writes toStatus/fromStatus for timeline compat.
 * - All reads use orderStage; list filter q.status is mapped to orderStage server-side.
 */

import type { Prisma } from "@prisma/client";
import type {
  DeliveryStatus,
  OrderFinancialStatus,
  OrderStage,
  OrderStatus,
  PaymentType,
} from "@prisma/client";
import { DateTime } from "luxon";
import { CRM_TIME_ZONE } from "../crm-timezone";

export type { OrderStage };

export type OrderNewFields = {
  orderStage: OrderStage;
  deliveryStatus: DeliveryStatus;
  financialStatus: OrderFinancialStatus;
};

type FinancialContext = {
  paymentType?: PaymentType | null;
  paidAmount?: number;
  totalAmount?: number;
  debtAmount?: number;
  paymentDueDate?: Date | null;
  /** When set: zero-total orders in early stages get INVOICE_PENDING instead of CLOSED. */
  orderStage?: OrderStage | null;
  /** Override "now" for due-date rules (tests). */
  asOf?: Date;
};

const TERMINAL_ORDER_STAGES: OrderStage[] = [
  "COMPLETED",
  "CANCELED",
  "REFUSED",
  "RETURN_IN_PROGRESS",
];

function kyivTodayYmd(now = new Date()): string {
  return DateTime.fromJSDate(now).setZone(CRM_TIME_ZONE).toISODate()!;
}

function kyivDueYmd(due: Date): string {
  return DateTime.fromJSDate(due).setZone(CRM_TIME_ZONE).toISODate()!;
}

/** Calendar days from today (Kyiv) until due date; negative = overdue. */
function kyivDaysUntilDue(due: Date, now = new Date()): number {
  const dueDt = DateTime.fromISO(kyivDueYmd(due), { zone: CRM_TIME_ZONE }).startOf("day");
  const todayDt = DateTime.fromISO(kyivTodayYmd(now), { zone: CRM_TIME_ZONE }).startOf("day");
  return Math.round(dueDt.diff(todayDt, "days").days);
}

/**
 * Maps legacy OrderStatus to orderStage (for setStatus -> setOrderStage delegation).
 */
export function legacyStatusToOrderStage(status: OrderStatus): OrderStage {
  return legacyStatusToStageAndDelivery(status).orderStage;
}

/** Legacy Order.status values that map to each orderStage (for list filters). */
export function legacyStatusesForOrderStage(stage: OrderStage): OrderStatus[] {
  const all: OrderStatus[] = [
    "NEW",
    "IN_WORK",
    "READY_TO_SHIP",
    "SHIPPED",
    "CONTROL_PAYMENT",
    "SUCCESS",
    "RETURNING",
    "CANCELED",
  ];
  return all.filter((status) => legacyStatusToOrderStage(status) === stage);
}

export function legacyStatusesForOrderStages(stages: OrderStage[]): OrderStatus[] {
  const set = new Set<OrderStatus>();
  for (const stage of stages) {
    for (const status of legacyStatusesForOrderStage(stage)) {
      set.add(status);
    }
  }
  return Array.from(set);
}

/**
 * Maps legacy OrderStatus to orderStage and deliveryStatus.
 * Conservative: one-to-one where obvious; safe defaults otherwise.
 */
function legacyStatusToStageAndDelivery(status: OrderStatus): {
  orderStage: OrderStage;
  deliveryStatus: DeliveryStatus;
} {
  switch (status) {
    case "NEW":
      return { orderStage: "NEW", deliveryStatus: "NOT_SHIPPED" };
    case "IN_WORK":
      return { orderStage: "CONFIRMED", deliveryStatus: "NOT_SHIPPED" };
    case "READY_TO_SHIP":
      return { orderStage: "READY_TO_SHIP", deliveryStatus: "NOT_SHIPPED" };
    case "SHIPPED":
      return { orderStage: "SHIPPED", deliveryStatus: "IN_TRANSIT" };
    case "CONTROL_PAYMENT":
      return { orderStage: "RECEIVED", deliveryStatus: "RECEIVED" };
    case "SUCCESS":
      return { orderStage: "COMPLETED", deliveryStatus: "RECEIVED" };
    case "RETURNING":
      return { orderStage: "RETURN_IN_PROGRESS", deliveryStatus: "RETURN_TO_WAREHOUSE" };
    case "CANCELED":
      return { orderStage: "CANCELED", deliveryStatus: "NOT_SHIPPED" };
    default:
      return { orderStage: "NEW", deliveryStatus: "NOT_SHIPPED" };
  }
}

/**
 * Phase 4: Derives financialStatus for financial kanban.
 * Rules:
 * - CLOSED: no financial follow-up (total<=0, or completed/canceled/return with no debt, or prepaid and paid).
 * - PAID: debt is 0 but order still in progress (not yet closed).
 * - INVOICE_PENDING: DEFERRED, has debt, no paymentDueDate set (invoice/due date not set).
 * - AWAITING_PAYMENT: has debt, waiting for payment (prepayment or deferred with due date set and not yet due).
 * - DUE_SOON: has debt, paymentDueDate within 3 days.
 * - OVERDUE: has debt, paymentDueDate in the past.
 */
function computeFinancialStatus(
  ctx: FinancialContext,
  legacyStatus?: OrderStatus,
): OrderFinancialStatus {
  const total = Number(ctx.totalAmount ?? 0);
  const paid = Number(ctx.paidAmount ?? 0);
  const debt = Number(ctx.debtAmount ?? 0);
  const paymentType = ctx.paymentType;
  const due = ctx.paymentDueDate ? new Date(ctx.paymentDueDate) : null;
  const now = ctx.asOf ?? new Date();

  // Terminal legacy: treat as closed
  if (legacyStatus === "CANCELED" || legacyStatus === "RETURNING") {
    return "CLOSED";
  }
  if (legacyStatus === "SUCCESS") {
    return debt <= 0 ? "CLOSED" : "PAID";
  }

  // Zero total: treat as CLOSED only if order is not in early stage (avoid "Новий" in "Закрито")
  if (total <= 0) {
    const earlyStages: OrderStage[] = ["NEW", "AWAITING_PAYMENT", "AWAITING_STOCK", "CONFIRMED"];
    const isEarly = ctx.orderStage != null && earlyStages.includes(ctx.orderStage);
    return isEarly ? "INVOICE_PENDING" : "CLOSED";
  }

  // No debt: CLOSED when terminal / prepaid done; PAID when paid but order still in progress
  if (debt <= 0) {
    const stage = ctx.orderStage ?? null;
    if (stage && TERMINAL_ORDER_STAGES.includes(stage)) {
      return "CLOSED";
    }
    if (paymentType === "PREPAYMENT" && paid >= total && total > 0) {
      return "CLOSED";
    }
    if (paid >= total && total > 0) {
      return "PAID";
    }
    return paid > 0 ? "PAID" : "CLOSED";
  }

  // Has debt
  if (paymentType === "PREPAYMENT") {
    return "AWAITING_PAYMENT";
  }

  // DEFERRED or null: invoice/due date logic
  if (!due) {
    return "INVOICE_PENDING"; // no due date set yet
  }
  const daysUntil = kyivDaysUntilDue(due, now);
  if (daysUntil < 0) return "OVERDUE";
  if (daysUntil <= 3) return "DUE_SOON";
  return "AWAITING_PAYMENT";
}

/** Active financial board: orders with debt or not in a terminal stage. */
export function financialBoardDefaultWhere(): Prisma.OrderWhereInput {
  return {
    OR: [
      { debtAmount: { gt: 0 } },
      { orderStage: { notIn: TERMINAL_ORDER_STAGES } },
      { orderStage: null },
    ],
  };
}

/** Orders with debt and payment due date before today (Kyiv calendar). */
export function financialOverdueWhere(now = new Date()): Prisma.OrderWhereInput {
  const startOfToday = DateTime.fromISO(kyivTodayYmd(now), { zone: CRM_TIME_ZONE })
    .startOf("day")
    .toJSDate();
  return {
    debtAmount: { gt: 0 },
    paymentDueDate: { not: null, lt: startOfToday },
  };
}

/** Orders with debt and payment due within the next 3 Kyiv calendar days (inclusive). */
export function financialDueSoonWhere(now = new Date()): Prisma.OrderWhereInput {
  const startOfToday = DateTime.fromISO(kyivTodayYmd(now), { zone: CRM_TIME_ZONE }).startOf("day");
  const endOfWindow = startOfToday.plus({ days: 3 }).endOf("day");
  return {
    debtAmount: { gt: 0 },
    paymentDueDate: {
      not: null,
      gte: startOfToday.toJSDate(),
      lte: endOfWindow.toJSDate(),
    },
  };
}

/** List filter for financialStatus; date-sensitive statuses use paymentDueDate, not stored column. */
export function financialStatusListWhere(
  status: OrderFinancialStatus,
  now = new Date(),
): Prisma.OrderWhereInput {
  switch (status) {
    case "OVERDUE":
      return financialOverdueWhere(now);
    case "DUE_SOON":
      return financialDueSoonWhere(now);
    default:
      return { financialStatus: status };
  }
}

/**
 * Returns new order model fields from legacy status and optional financial context.
 * Use for dual-write (setStatus, NP, Bitrix) and backfill.
 */
export function legacyStatusToNewFields(
  status: OrderStatus,
  financialContext?: FinancialContext,
): OrderNewFields {
  const { orderStage, deliveryStatus } = legacyStatusToStageAndDelivery(status);
  const financialStatus = computeFinancialStatus(
    financialContext ?? {},
    status,
  );
  return { orderStage, deliveryStatus, financialStatus };
}

/**
 * Returns new order model fields (orderStage, deliveryStatus, financialStatus) as plain enum values.
 * Use for both Prisma update and create; paymentDueDate is not set here (set by user/1C/Google Sheet).
 */
export function legacyStatusToOrderUpdate(
  status: OrderStatus,
  financialContext?: FinancialContext,
): OrderNewFields {
  return legacyStatusToNewFields(status, financialContext);
}

/**
 * Computes only financialStatus from current order amounts and payment type.
 * Use in PaymentsService.recalcOrder after updating paidAmount/debtAmount.
 */
export function computeFinancialStatusFromOrder(ctx: FinancialContext): OrderFinancialStatus {
  return computeFinancialStatus(ctx);
}

// --- Phase 2: orderStage as source of truth -> legacy status for compatibility ---

/**
 * Maps orderStage to legacy OrderStatus for dual-write and OrderStatusHistory.
 * When orderStage is RECEIVED, legacy status depends on debt (CONTROL_PAYMENT vs SUCCESS).
 */
export function orderStageToLegacyStatus(
  stage: OrderStage,
  ctx?: { debtAmount?: number | null },
): OrderStatus {
  const debt = Number(ctx?.debtAmount ?? 0);
  switch (stage) {
    case "NEW":
      return "NEW";
    case "CONFIRMED":
    case "AWAITING_PAYMENT":
    case "AWAITING_STOCK":
      return "IN_WORK";
    case "READY_TO_SHIP":
      return "READY_TO_SHIP";
    case "SHIPPED":
    case "AWAITING_RECEIPT":
      return "SHIPPED";
    case "RECEIVED":
      return debt > 0.00001 ? "CONTROL_PAYMENT" : "SUCCESS";
    case "COMPLETED":
      return "SUCCESS";
    case "CANCELED":
      return "CANCELED";
    case "REFUSED":
    case "RETURN_IN_PROGRESS":
      return "RETURNING";
    default:
      return "NEW";
  }
}

/**
 * Default deliveryStatus for a given orderStage (for setOrderStage updates).
 */
export function orderStageToDeliveryStatus(stage: OrderStage): DeliveryStatus {
  switch (stage) {
    case "NEW":
    case "CONFIRMED":
    case "AWAITING_PAYMENT":
    case "AWAITING_STOCK":
    case "READY_TO_SHIP":
    case "CANCELED":
      return "NOT_SHIPPED";
    case "SHIPPED":
    case "AWAITING_RECEIPT":
      return stage === "AWAITING_RECEIPT" ? "AWAITING_RECEIPT" : "IN_TRANSIT";
    case "RECEIVED":
    case "COMPLETED":
      return "RECEIVED";
    case "REFUSED":
      return "REFUSED";
    case "RETURN_IN_PROGRESS":
      return "RETURN_TO_WAREHOUSE";
    default:
      return "NOT_SHIPPED";
  }
}
