import type { OrderStage, OrderStatus } from "@prisma/client";
import {
  legacyStatusToOrderStage,
  orderStageToLegacyStatus,
} from "../orders/order-status-sync.mapper";

/**
 * First TTN on a NEW order. CONFIRMED stays manual (setOrderStage, after stock).
 */
export function orderStageAfterFirstTtnFromNew(order: {
  paymentType: string | null;
  paidAmount: unknown;
  totalAmount: unknown;
}): OrderStage {
  if (order.paymentType === "PREPAYMENT") {
    const total = Number(order.totalAmount ?? 0);
    const paid = Number(order.paidAmount ?? 0);
    if (total > 0.00001 && paid < total - 0.00001) return "AWAITING_PAYMENT";
  }
  return "AWAITING_STOCK";
}

/**
 * Current legacy status for NP sync. orderStage wins over a stale Order.status
 * so a leftover NEW does not look like the order is still new.
 */
export function legacyStatusForNpSync(order: {
  status?: OrderStatus | null;
  orderStage?: OrderStage | null;
  debtAmount?: number | null;
}): OrderStatus {
  if (order.orderStage) {
    return orderStageToLegacyStatus(order.orderStage, { debtAmount: order.debtAmount });
  }
  return order.status ?? "NEW";
}

/**
 * Nova Poshta tracking → legacy status.
 * Code 1 / «накладная создана, но не сдана» returns null: that state must not
 * change orderStage (IN_WORK would become CONFIRMED).
 */
export function mapNpTrackingToLegacyStatus(args: {
  npCode?: string | number | null;
  npText?: string | null;
  debtAmount?: number | null;
}): OrderStatus | null {
  const code = String(args.npCode ?? "").trim();
  const text = String(args.npText ?? "").toLowerCase();
  const debt = Number(args.debtAmount ?? 0);

  if (code === "2" || text.includes("видал") || text.includes("удален")) return "CANCELED";

  if (
    text.includes("повернен") ||
    text.includes("повернення") ||
    text.includes("возврат") ||
    text.includes("відмова") ||
    text.includes("отказ") ||
    text.includes("не вруч") ||
    text.includes("не вручен")
  ) {
    return "RETURNING";
  }

  if (["9", "10", "11"].includes(code) || text.includes("отрим") || text.includes("получено")) {
    return debt <= 0.00001 ? "SUCCESS" : "CONTROL_PAYMENT";
  }

  if (
    ["3", "4", "41", "5", "6", "7", "8", "101"].includes(code) ||
    text.includes("в дороз") ||
    text.includes("в пути") ||
    text.includes("прямує") ||
    text.includes("прибул") ||
    text.includes("прийнят") ||
    text.includes("принят")
  ) {
    return "SHIPPED";
  }

  // Создана, но не сдана — orderStage не меняем.
  if (code === "1" || text.includes("створив") || text.includes("создан")) return null;

  return null;
}

export function shouldAdvanceNpLegacyStatus(current: OrderStatus, next: OrderStatus): boolean {
  if (current === "CANCELED") return false;
  if (current === "SUCCESS" && next !== "SUCCESS") return false;

  if (next === "CANCELED") return true;
  if (next === "RETURNING") return true;

  const rank: Record<OrderStatus, number> = {
    NEW: 10,
    IN_WORK: 20,
    READY_TO_SHIP: 30,
    SHIPPED: 40,
    CONTROL_PAYMENT: 50,
    SUCCESS: 60,
    RETURNING: 70,
    CANCELED: 80,
  };

  return (rank[next] ?? 0) > (rank[current] ?? 0);
}

/**
 * Legacy status to apply to the order, or null when NP sync must not change orderStage.
 * Null means: do not write OrderStatusHistory. CONFIRMED is never returned.
 */
export function resolveNpOrderStageUpdate(args: {
  currentStage: OrderStage | null;
  currentLegacy: OrderStatus;
  mappedLegacy: OrderStatus | null;
}): OrderStatus | null {
  const mapped = args.mappedLegacy;
  if (!mapped || mapped === "IN_WORK") return null;
  if (!shouldAdvanceNpLegacyStatus(args.currentLegacy, mapped)) return null;

  const nextStage = legacyStatusToOrderStage(mapped);
  if (nextStage === "CONFIRMED") return null;
  if (args.currentStage != null && nextStage === args.currentStage) return null;
  return mapped;
}
