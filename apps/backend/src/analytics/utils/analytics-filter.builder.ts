import type { Prisma } from "@prisma/client";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../../auth/auth.types";
import { ANALYTICS_EXCLUDED_ORDER_STAGES } from "../analytics.constants";

export type OrderScopeInput = {
  actor: AuthUser;
  managerId?: string;
  allowedOwnerIds?: string[];
};

export function buildPeriodOrderWhere(
  from: Date,
  to: Date,
  scope: OrderScopeInput,
): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {
    createdAt: { gte: from, lte: to },
    OR: [
      { orderStage: { notIn: [...ANALYTICS_EXCLUDED_ORDER_STAGES] } },
      { orderStage: null },
    ],
  };
  if (scope.managerId) where.ownerId = scope.managerId;
  else if (scope.allowedOwnerIds !== undefined) where.ownerId = { in: scope.allowedOwnerIds };
  return where;
}

export function buildDebtOrderWhere(scope: OrderScopeInput): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {
    OR: [
      { orderStage: { notIn: [...ANALYTICS_EXCLUDED_ORDER_STAGES] } },
      { orderStage: null },
    ],
  };
  if (scope.managerId) where.ownerId = scope.managerId;
  else if (scope.allowedOwnerIds !== undefined) where.ownerId = { in: scope.allowedOwnerIds };
  return where;
}

export function buildLeadPeriodWhere(
  from: Date,
  to: Date,
  scope: {
    actor: AuthUser;
    allowedOwnerIds?: string[];
    managerId?: string;
  },
): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = { createdAt: { gte: from, lte: to } };
  if (scope.managerId) {
    where.ownerId = scope.managerId;
  } else if (scope.actor.role === UserRole.MANAGER) {
    where.OR = [{ ownerId: scope.actor.id }, { ownerId: null }];
  } else if (scope.allowedOwnerIds && scope.allowedOwnerIds.length > 0) {
    where.OR = [{ ownerId: { in: scope.allowedOwnerIds } }, { ownerId: null }];
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

export function buildOverdueTaskWhere(scope: {
  allowedAssigneeIds?: string[];
}): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = {
    dueAt: { not: null, lt: new Date() },
    status: { in: ["OPEN", "IN_PROGRESS"] },
  };
  if (scope.allowedAssigneeIds !== undefined) {
    where.assigneeId = { in: scope.allowedAssigneeIds };
  }
  return where;
}

