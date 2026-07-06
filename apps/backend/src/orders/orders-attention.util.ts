import type { Prisma } from "@prisma/client";
import { resolvePresetPeriod } from "../analytics/utils/analytics-date.util";
import type { ResolvedPeriod } from "../analytics/utils/analytics-date.util";
import { financialOverdueWhere } from "./order-status-sync.mapper";

export const ORDER_ATTENTION_PRESETS = ["overdue-payments", "stuck"] as const;

export type OrderAttentionPreset = (typeof ORDER_ATTENTION_PRESETS)[number];

export type OrderAttentionPeriod = "week" | "month";

export type OrderOwnerScope = {
  managerId?: string;
  allowedOwnerIds?: string[];
};

export const STUCK_ORDERS_CANDIDATE_CAP = 600;

export function isOrderAttentionPreset(value: string): value is OrderAttentionPreset {
  return (ORDER_ATTENTION_PRESETS as readonly string[]).includes(value);
}

export function resolveOrderAttentionPeriod(
  periodKey: OrderAttentionPeriod | undefined,
): ResolvedPeriod {
  return resolvePresetPeriod(periodKey === "week" ? "week" : "month");
}

/** Operational overdue payments: debt + paymentDueDate before today (Kyiv). */
export function buildOrderOverduePaymentsWhere(
  scope: OrderOwnerScope,
  now = new Date(),
): Prisma.OrderWhereInput {
  const parts: Prisma.OrderWhereInput[] = [financialOverdueWhere(now)];
  if (scope.managerId) {
    parts.push({ ownerId: scope.managerId });
  } else if (scope.allowedOwnerIds !== undefined) {
    parts.push({ ownerId: { in: scope.allowedOwnerIds } });
  }
  return parts.length === 1 ? parts[0]! : { AND: parts };
}

export function getStuckCutoff(asOf: Date): Date {
  const cutoff = new Date(asOf);
  cutoff.setDate(cutoff.getDate() - 3);
  return cutoff;
}

/** Base Prisma filter for stuck-order candidates (post-filter still required). */
export function buildStuckOrdersBaseWhere(
  period: ResolvedPeriod,
  scope: OrderOwnerScope,
): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {
    OR: [{ orderStage: null }, { orderStage: { notIn: ["CANCELED", "REFUSED", "COMPLETED"] } }],
    createdAt: { gte: period.from, lte: period.to },
  };
  if (scope.managerId) {
    where.ownerId = scope.managerId;
  } else if (scope.allowedOwnerIds !== undefined) {
    where.ownerId = { in: scope.allowedOwnerIds };
  }
  return where;
}

export type StuckOrderCandidate = {
  id: string;
  updatedAt: Date;
  statusHistory: { createdAt: Date }[];
};

export function isOrderStuck(row: StuckOrderCandidate, asOf: Date): boolean {
  const since = row.statusHistory[0]?.createdAt ?? row.updatedAt;
  return since < getStuckCutoff(asOf);
}

export function filterStuckOrders<T extends StuckOrderCandidate>(rows: T[], asOf: Date): T[] {
  return rows.filter((o) => isOrderStuck(o, asOf));
}
