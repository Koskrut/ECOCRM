import type { Prisma } from "@prisma/client";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../../auth/auth.types";
import {
  ANALYTICS_BOOKED_EXCLUDED_ORDER_STAGES,
  ANALYTICS_EXCLUDED_ORDER_STAGES,
} from "../analytics.constants";

export type OrderScopeInput = {
  actor: AuthUser;
  managerId?: string;
  allowedOwnerIds?: string[];
};

/** Stage clause for booked sales KPIs: READY_TO_SHIP+ (and legacy null), not pre-ship drafts. */
export function bookedOrderStageClause(): Prisma.OrderWhereInput {
  return {
    OR: [
      { orderStage: { notIn: [...ANALYTICS_BOOKED_EXCLUDED_ORDER_STAGES] } },
      { orderStage: null },
    ],
  };
}

/** Stage clause for pipeline charts: all non-void stages (includes NEW / AWAITING_STOCK). */
export function pipelineOrderStageClause(): Prisma.OrderWhereInput {
  return {
    OR: [
      { orderStage: { notIn: [...ANALYTICS_EXCLUDED_ORDER_STAGES] } },
      { orderStage: null },
    ],
  };
}

function applyOrderScope(
  where: Prisma.OrderWhereInput,
  scope: OrderScopeInput,
): Prisma.OrderWhereInput {
  if (scope.managerId) where.ownerId = scope.managerId;
  else if (scope.allowedOwnerIds !== undefined) where.ownerId = { in: scope.allowedOwnerIds };
  return where;
}

/** Period orders that count as booked / “real” sales (excludes pre-ship + voids). */
export function buildPeriodOrderWhere(
  from: Date,
  to: Date,
  scope: OrderScopeInput,
): Prisma.OrderWhereInput {
  return applyOrderScope(
    {
      createdAt: { gte: from, lte: to },
      ...bookedOrderStageClause(),
    },
    scope,
  );
}

/** Period orders for stage/pipeline breakdown (excludes voids only). */
export function buildPeriodPipelineOrderWhere(
  from: Date,
  to: Date,
  scope: OrderScopeInput,
): Prisma.OrderWhereInput {
  return applyOrderScope(
    {
      createdAt: { gte: from, lte: to },
      ...pipelineOrderStageClause(),
    },
    scope,
  );
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

/** Tasks open/in-progress whose deadline falls in [from, to] (inclusive window, same as order period). */
export function buildOverdueTaskWhereForPeriod(
  from: Date,
  to: Date,
  scope: { managerId?: string; allowedAssigneeIds?: string[] },
): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = {
    dueAt: { not: null, gte: from, lte: to },
    status: { in: ["OPEN", "IN_PROGRESS"] },
  };
  if (scope.managerId) {
    where.assigneeId = scope.managerId;
  } else if (scope.allowedAssigneeIds !== undefined) {
    where.assigneeId = { in: scope.allowedAssigneeIds };
  }
  return where;
}
