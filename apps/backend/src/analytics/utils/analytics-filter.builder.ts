import type { Prisma } from "@prisma/client";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../../auth/auth.types";
import { ANALYTICS_EXCLUDED_ORDER_STAGES } from "../analytics.constants";

export type OrderScopeInput = {
  actor: AuthUser;
  /** Optional single manager filter (ADMIN / LEAD with team validation at controller) */
  managerId?: string;
  /** Owner ids allowed for LEAD (includes team members); ADMIN = undefined = no restriction */
  allowedOwnerIds?: string[];
};

/**
 * Order rows for period KPIs: created in range, not canceled/refused, RBAC owner scope applied first.
 */
export function buildPeriodOrderWhere(
  from: Date,
  to: Date,
  scope: OrderScopeInput,
): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {
    createdAt: { gte: from, lte: to },
    OR: [
      { orderStage: { notIn: ANALYTICS_EXCLUDED_ORDER_STAGES } },
      { orderStage: null },
    ],
  };

  if (scope.managerId) {
    where.ownerId = scope.managerId;
  } else if (scope.allowedOwnerIds !== undefined && scope.allowedOwnerIds.length > 0) {
    where.ownerId = { in: scope.allowedOwnerIds };
  }

  return where;
}

/** Debt snapshot: all non-excluded stages */
export function buildDebtOrderWhere(scope: OrderScopeInput): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {
    OR: [
      { orderStage: { notIn: ANALYTICS_EXCLUDED_ORDER_STAGES } },
      { orderStage: null },
    ],
  };
  if (scope.managerId) {
    where.ownerId = scope.managerId;
  } else if (scope.allowedOwnerIds !== undefined && scope.allowedOwnerIds.length > 0) {
    where.ownerId = { in: scope.allowedOwnerIds };
  }
  return where;
}

export function buildLeadPeriodWhere(
  from: Date,
  to: Date,
  scope: {
    actor: AuthUser;
    /** Order owner ids (same as team for LEAD) */
    allowedOwnerIds?: string[];
    managerId?: string;
  },
): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {
    createdAt: { gte: from, lte: to },
  };
  if (scope.managerId) {
    where.ownerId = scope.managerId;
  } else if (scope.actor.role === UserRole.MANAGER) {
    where.OR = [{ ownerId: scope.actor.id }, { ownerId: null }];
  } else if (scope.allowedOwnerIds && scope.allowedOwnerIds.length > 0) {
    where.OR = [
      { ownerId: { in: scope.allowedOwnerIds } },
      { ownerId: null },
    ];
  }
  return where;
}

export function buildPaymentPeriodWhere(
  from: Date,
  to: Date,
  orderOwnerFilter: Prisma.OrderWhereInput,
): Prisma.PaymentWhereInput {
  return {
    status: "COMPLETED",
    paidAt: { gte: from, lte: to },
    order: orderOwnerFilter,
  };
}

/** Tasks for attention: overdue, scoped by assignee for LEAD/MANAGER */
export function buildOverdueTaskWhere(scope: {
  allowedAssigneeIds?: string[];
}): Prisma.TaskWhereInput {
  const now = new Date();
  const where: Prisma.TaskWhereInput = {
    dueAt: { not: null, lt: now },
    status: { in: ["OPEN", "IN_PROGRESS"] },
  };
  if (scope.allowedAssigneeIds && scope.allowedAssigneeIds.length > 0) {
    where.assigneeId = { in: scope.allowedAssigneeIds };
  }
  return where;
}
