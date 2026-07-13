import type { Prisma, ReceivablesReconcileStatus } from "@prisma/client";
import type { AnalyticsScope } from "../analytics/analytics-scope.service";
import { ANALYTICS_EXCLUDED_ORDER_STAGES } from "../analytics/analytics.constants";
import { financialOverdueWhere } from "../orders/order-status-sync.mapper";

export function buildReceivablesDebtOrderWhere(scope: AnalyticsScope): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {
    debtAmount: { gt: 0 },
    clientId: { not: null },
    OR: [
      { orderStage: { notIn: [...ANALYTICS_EXCLUDED_ORDER_STAGES] } },
      { orderStage: null },
    ],
  };

  if (scope.orderScope.managerId) {
    where.ownerId = scope.orderScope.managerId;
  } else if (scope.orderScope.allowedOwnerIds !== undefined) {
    where.ownerId = { in: scope.orderScope.allowedOwnerIds };
  }

  return where;
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
