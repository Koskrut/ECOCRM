import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../../settings/settings.service";
import type { AnalyticsScope } from "../analytics-scope.service";
import {
  buildDebtOrderWhere,
  buildLeadPeriodWhere,
  buildPeriodOrderWhere,
} from "../utils/analytics-filter.builder";
import type { ResolvedPeriod } from "../utils/analytics-date.util";
import { safeNum, toUsd } from "../utils/analytics-currency.util";

export type DrilldownType =
  | "orders_period"
  | "payments_period"
  | "leads_period"
  | "overdue_orders"
  | "overdue_tasks";

@Injectable()
export class AnalyticsDrilldownService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async drilldown(
    type: string,
    period: ResolvedPeriod,
    scope: AnalyticsScope,
    page: number,
    pageSize: number,
  ): Promise<{ items: unknown[]; total: number; page: number; pageSize: number }> {
    if (scope.emptyTeam) {
      return { items: [], total: 0, page, pageSize };
    }

    const rates = await this.settings.getExchangeRates();
    const skip = (page - 1) * pageSize;
    const take = Math.min(100, Math.max(1, pageSize));

    switch (type as DrilldownType) {
      case "orders_period": {
        const where = buildPeriodOrderWhere(period.from, period.to, scope.orderScope);
        const [total, rows] = await Promise.all([
          this.prisma.order.count({ where }),
          this.prisma.order.findMany({
            where,
            skip,
            take,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              orderNumber: true,
              orderStage: true,
              totalAmount: true,
              returnAdjustmentAmount: true,
              currency: true,
              createdAt: true,
              owner: { select: { fullName: true } },
            },
          }),
        ]);
        return {
          total,
          page,
          pageSize: take,
          items: rows.map((o) => ({
            ...o,
            bookedLine: Math.max(
              0,
              Number(o.totalAmount ?? 0) - Number(o.returnAdjustmentAmount ?? 0),
            ),
            bookedLineUsd: toUsd(
              Math.max(0, safeNum(o.totalAmount) - safeNum(o.returnAdjustmentAmount)),
              o.currency,
              rates,
            ),
            createdAt: o.createdAt.toISOString(),
          })),
        };
      }
      case "payments_period": {
        const orderFilter: Prisma.OrderWhereInput = {};
        if (scope.orderScope.managerId) {
          orderFilter.ownerId = scope.orderScope.managerId;
        } else if (
          scope.orderScope.allowedOwnerIds &&
          scope.orderScope.allowedOwnerIds.length > 0
        ) {
          orderFilter.ownerId = { in: scope.orderScope.allowedOwnerIds };
        }
        const periodOnlyWhere: Prisma.PaymentWhereInput = {
          paidAt: { gte: period.from, lte: period.to },
        };
        const completedInPeriodWhere: Prisma.PaymentWhereInput = {
          status: "COMPLETED",
          paidAt: { gte: period.from, lte: period.to },
        };
        const where: Prisma.PaymentWhereInput = {
          status: "COMPLETED",
          paidAt: { gte: period.from, lte: period.to },
          order: orderFilter,
        };
        const [
          total,
          rows,
          totalInPeriodAllStatuses,
          totalCompletedInPeriodAllOwners,
          totalCompletedInPeriodScoped,
        ] = await Promise.all([
          this.prisma.payment.count({ where }),
          this.prisma.payment.findMany({
            where,
            skip,
            take,
            orderBy: { paidAt: "desc" },
            select: {
              id: true,
              amount: true,
              amountUsd: true,
              currency: true,
              paidAt: true,
              orderId: true,
              order: { select: { orderNumber: true, owner: { select: { fullName: true } } } },
            },
          }),
          this.prisma.payment.count({ where: periodOnlyWhere }),
          this.prisma.payment.count({ where: completedInPeriodWhere }),
          this.prisma.payment.count({ where }),
        ]);

        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "18e84e" },
          body: JSON.stringify({
            sessionId: "18e84e",
            runId: "run-payments-drilldown-1",
            hypothesisId: "H20",
            location: "analytics-drilldown.service.ts:payments_period",
            message: "Payments drilldown counts (why fewer than expected)",
            data: {
              from: period.from.toISOString(),
              to: period.to.toISOString(),
              scopeManagerId: scope.orderScope.managerId ?? null,
              scopeAllowedOwnerIdsCount: scope.orderScope.allowedOwnerIds?.length ?? null,
              totalInPeriodAllStatuses,
              totalCompletedInPeriodAllOwners,
              totalCompletedInPeriodScoped,
              page,
              pageSize: take,
              returnedRows: rows.length,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion

        return {
          total,
          page,
          pageSize: take,
          items: rows.map((p) => ({
            id: p.id,
            amountUsd:
              p.amountUsd != null ? safeNum(p.amountUsd) : toUsd(safeNum(p.amount), p.currency, rates),
            paidAt: p.paidAt.toISOString(),
            orderId: p.orderId,
            orderNumber: p.order.orderNumber,
            ownerName: p.order.owner.fullName,
          })),
        };
      }
      case "overdue_orders": {
        const where: Prisma.OrderWhereInput = {
          ...buildDebtOrderWhere(scope.orderScope),
          financialStatus: "OVERDUE",
          debtAmount: { gt: 0 },
        };
        const [total, rows] = await Promise.all([
          this.prisma.order.count({ where }),
          this.prisma.order.findMany({
            where,
            skip,
            take,
            orderBy: { paymentDueDate: "asc" },
            select: {
              id: true,
              orderNumber: true,
              debtAmount: true,
              currency: true,
              paymentDueDate: true,
              client: { select: { firstName: true, lastName: true } },
            },
          }),
        ]);
        return {
          total,
          page,
          pageSize: take,
          items: rows.map((o) => ({
            id: o.id,
            orderNumber: o.orderNumber,
            debtAmountUsd: toUsd(safeNum(o.debtAmount), o.currency, rates),
            paymentDueDate: o.paymentDueDate?.toISOString() ?? null,
            clientName: o.client
              ? [o.client.firstName, o.client.lastName].filter(Boolean).join(" ")
              : null,
          })),
        };
      }
      case "leads_period": {
        const where = buildLeadPeriodWhere(period.from, period.to, {
          actor: scope.orderScope.actor,
          allowedOwnerIds: scope.orderScope.allowedOwnerIds,
          managerId: scope.orderScope.managerId,
        });
        const [total, rows] = await Promise.all([
          this.prisma.lead.count({ where }),
          this.prisma.lead.findMany({
            where,
            skip,
            take,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              status: true,
              source: true,
              fullName: true,
              name: true,
              createdAt: true,
              owner: { select: { fullName: true } },
            },
          }),
        ]);
        return {
          total,
          page,
          pageSize: take,
          items: rows.map((l) => ({
            id: l.id,
            status: l.status,
            source: l.source,
            name: l.fullName ?? l.name,
            createdAt: l.createdAt.toISOString(),
            ownerName: l.owner?.fullName ?? null,
          })),
        };
      }
      case "overdue_tasks": {
        const now = new Date();
        const where: Prisma.TaskWhereInput = {
          dueAt: { not: null, lt: now },
          status: { in: ["OPEN", "IN_PROGRESS"] },
        };
        if (scope.allowedAssigneeIds && scope.allowedAssigneeIds.length > 0) {
          where.assigneeId = { in: scope.allowedAssigneeIds };
        }
        const [total, rows] = await Promise.all([
          this.prisma.task.count({ where }),
          this.prisma.task.findMany({
            where,
            skip,
            take,
            orderBy: { dueAt: "asc" },
            select: {
              id: true,
              title: true,
              dueAt: true,
              assignee: { select: { fullName: true } },
              orderId: true,
            },
          }),
        ]);
        return {
          total,
          page,
          pageSize: take,
          items: rows.map((t) => ({
            id: t.id,
            title: t.title,
            dueAt: t.dueAt?.toISOString() ?? null,
            assigneeName: t.assignee.fullName,
            orderId: t.orderId,
          })),
        };
      }
      default:
        throw new BadRequestException(`Unknown drilldown type: ${type}`);
    }
  }
}
