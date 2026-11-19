import type { OrderStage } from "@prisma/client";
import type { ContactScoringSignal } from "./types/contacts-priority.types";

const VOID_ORDER_STAGES = new Set<OrderStage>(["CANCELED", "REFUSED"]);

/** A canceled or refused order is not a purchase. It can still be a touch. */
export function orderCountsAsPurchase(order: { orderStage?: OrderStage | null }): boolean {
  if (order.orderStage == null) return true;
  return !VOID_ORDER_STAGES.has(order.orderStage);
}

/**
 * Missed, busy, and failed calls are not a conversation with the client.
 * Unknown or empty status is kept: older imports must not all look untouched.
 */
export function callCountsAsContact(status: string | null | undefined): boolean {
  if (!status?.trim()) return true;
  const compact = status.toLowerCase().replace(/[\s_-]+/g, "");
  if (
    compact.includes("missed") ||
    compact.includes("noanswer") ||
    compact.includes("notanswered") ||
    compact.includes("busy") ||
    compact.includes("failed") ||
    compact.includes("cancel")
  ) {
    return false;
  }
  return true;
}

export function laterDate(
  a: Date | null | undefined,
  b: Date | null | undefined,
): Date | null {
  const left = validDate(a);
  const right = validDate(b);
  if (left && right) return left > right ? left : right;
  return left ?? right;
}

export function daysSince(now: Date, at: Date | null | undefined): number | null {
  const when = validDate(at);
  if (!when) return null;
  return Math.max(0, Math.floor((now.getTime() - when.getTime()) / (1000 * 60 * 60 * 24)));
}

function validDate(value: Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Status set by a manager when the card is a duplicate of another contact. */
export function contactStatusIsDuplicate(status: string | null | undefined): boolean {
  const value = (status ?? "").trim().toLowerCase();
  if (!value) return false;
  return value.includes("дублікат") || value.includes("дубликат") || value.includes("duplicate");
}

export function buildContactScoringSignal(input: {
  contactId: string;
  createdAt: Date;
  now: Date;
  lastActivityAt: Date | null;
  lastCallAt: Date | null;
  /** Telegram, Instagram, or any other inbox message. */
  lastMessageAt: Date | null;
  /** Latest purchase. Canceled and refused orders are not included. */
  lastOrderAt: Date | null;
  /** Latest order of any stage. Creating or canceling an order is still a touch. */
  anyOrderAt: Date | null;
  ordersCountAll: number;
  overdueFollowupTasks: number;
  openTasksCount: number;
  debtAmount: number;
  revenue30: number;
  revenue90: number;
  revenue365: number;
  ordersCount30: number;
  ordersCount90: number;
  ordersCount365: number;
}): ContactScoringSignal {
  const lastOrderAt = validDate(input.lastOrderAt);
  const lastContactAt = laterDate(
    laterDate(laterDate(input.lastActivityAt, input.lastCallAt), input.lastMessageAt),
    input.anyOrderAt,
  );
  const daysSinceCreated = daysSince(input.now, input.createdAt) ?? 0;
  // Keep the first two weeks in "new, no first contact". After that, silence is
  // a real no-contact gap, otherwise the person vanishes from every work list.
  const touchedDays = daysSince(input.now, lastContactAt);
  const daysSinceLastContact =
    touchedDays != null ? touchedDays : daysSinceCreated > 14 ? daysSinceCreated : null;
  const daysSinceLastOrder = daysSince(input.now, lastOrderAt);
  const hasOrderHistory = input.ordersCountAll > 0;
  const ordersCount90 = input.ordersCount90;
  const ordersCount365 = input.ordersCount365;

  const isAtRisk =
    hasOrderHistory &&
    ((daysSinceLastOrder != null && daysSinceLastOrder >= 45) ||
      (daysSinceLastContact != null && daysSinceLastContact >= 30));
  const isDormant =
    hasOrderHistory && daysSinceLastOrder != null && daysSinceLastOrder >= 90;
  const isNewLeadNoFirstContact = daysSinceCreated <= 14 && lastContactAt == null;

  return {
    contactId: input.contactId,
    daysSinceCreated,
    lastContactAt,
    lastOrderAt,
    daysSinceLastContact,
    daysSinceLastOrder,
    hasOrderHistory,
    overdueFollowupTasks: input.overdueFollowupTasks,
    openTasksCount: input.openTasksCount,
    debtAmount: input.debtAmount,
    revenue30: input.revenue30,
    revenue90: input.revenue90,
    revenue365: input.revenue365,
    ordersCount30: input.ordersCount30,
    ordersCount90,
    ordersCount365,
    avgCheck90: ordersCount90 > 0 ? input.revenue90 / ordersCount90 : 0,
    avgCheck365: ordersCount365 > 0 ? input.revenue365 / ordersCount365 : 0,
    isNewLeadNoFirstContact,
    isDormant,
    isAtRisk,
  };
}
