import type { OrderStage, Prisma, ReceivablesReconcileStatus } from "@prisma/client";
import type { AnalyticsScope } from "../analytics/analytics-scope.service";
import { financialOverdueWhere } from "../orders/order-status-sync.mapper";
import { RECEIVABLES_DEBT_ORDER_STAGES } from "./receivables.constants";

export const RECEIVABLES_EXCLUDED_LEGACY_SOURCES = ["bitrix"] as const;

/** CRM operational debt: exclude Bitrix legacy imports from reconciliation. */
export function excludeBitrixLegacyWhere(): Prisma.OrderWhereInput {
  return {
    OR: [{ legacySource: null }, { legacySource: { not: "bitrix" } }],
  };
}

/** Canonical operational receivables stages + non-legacy filter (shared across UI surfaces). */
export function buildOperationalDebtOrderWhere(
  extra?: Prisma.OrderWhereInput,
): Prisma.OrderWhereInput {
  const parts: Prisma.OrderWhereInput[] = [
    { orderStage: { in: [...RECEIVABLES_DEBT_ORDER_STAGES] } },
    excludeBitrixLegacyWhere(),
  ];
  if (extra) parts.push(extra);
  return { AND: parts };
}

export function isOperationalDebtOrder(order: {
  orderStage?: OrderStage | null;
  legacySource?: string | null;
}): boolean {
  if (order.legacySource === "bitrix") return false;
  return (
    order.orderStage != null &&
    RECEIVABLES_DEBT_ORDER_STAGES.includes(order.orderStage)
  );
}

function buildReceivablesDebtOrderBase(scope: AnalyticsScope): Prisma.OrderWhereInput {
  const extra: Prisma.OrderWhereInput = {
    OR: [{ debtAmount: { gt: 0 } }, { creditAmount: { gt: 0 } }],
    clientId: { not: null },
  };

  if (scope.orderScope.managerId) {
    extra.ownerId = scope.orderScope.managerId;
  } else if (scope.orderScope.allowedOwnerIds !== undefined) {
    extra.ownerId = { in: scope.orderScope.allowedOwnerIds };
  }

  return buildOperationalDebtOrderWhere(extra);
}

export function buildReceivablesDebtOrderWhere(scope: AnalyticsScope): Prisma.OrderWhereInput {
  return buildReceivablesDebtOrderBase(scope);
}

export function buildBitrixLegacyDebtOrderWhere(scope: AnalyticsScope): Prisma.OrderWhereInput {
  return {
    AND: [buildReceivablesDebtOrderBase(scope), { legacySource: "bitrix" }],
  };
}

export function buildReceivablesContactWhere(scope: AnalyticsScope): Prisma.ContactWhereInput {
  if (scope.orderScope.managerId) {
    return { ownerId: scope.orderScope.managerId };
  }
  if (scope.orderScope.allowedOwnerIds !== undefined) {
    return { ownerId: { in: scope.orderScope.allowedOwnerIds } };
  }
  return {};
}

export function computeReconcileStatus(
  amount1C: number,
  amountCRM: number,
  contactId: string | null,
  has1C: boolean,
  tolerance: number,
): ReceivablesReconcileStatus {
  if (!has1C && amountCRM > tolerance) return "ONLY_CRM";
  if (has1C && !contactId) return "ONLY_1C";
  const delta = amount1C - amountCRM;
  if (Math.abs(delta) <= tolerance) return "ALIGNED";
  if (delta > tolerance) return "DELTA_1C_MORE";
  return "DELTA_CRM_MORE";
}

export function isReceivablesDeltaStatus(status: ReceivablesReconcileStatus): boolean {
  return status !== "ALIGNED";
}

export function buildOverdueDebtOrderWhere(scope: AnalyticsScope): Prisma.OrderWhereInput {
  return {
    AND: [buildReceivablesDebtOrderWhere(scope), financialOverdueWhere()],
  };
}

export function buildBitrixLegacyOverdueDebtOrderWhere(scope: AnalyticsScope): Prisma.OrderWhereInput {
  return {
    AND: [buildBitrixLegacyDebtOrderWhere(scope), financialOverdueWhere()],
  };
}
