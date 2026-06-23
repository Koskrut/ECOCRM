import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PaymentStatus, UserRole, VisitStatus } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import type { ExchangeRates } from "../settings/settings.service";
import { SettingsService } from "../settings/settings.service";
import { getBaseCurrency, paymentToBase } from "../common/currency.util";
import { instantToKyivYmd, kyivDayBounds, kyivStatsRange, todayYmdKyiv } from "../crm-timezone";
import { DayPlanService } from "../day-plan/day-plan.service";
import type { DayPlanStatus } from "../day-plan/day-plan.types";

export type DashboardPeriod = "week" | "month";

function getDateRange(period: DashboardPeriod): { from: Date; to: Date } {
  return kyivStatsRange(period === "week" ? 6 : 29);
}

function buildOrderWhere(actor: AuthUser | undefined, from: Date, to: Date): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {
    createdAt: { gte: from, lte: to },
  };
  if (actor?.role === UserRole.MANAGER) {
    where.ownerId = actor.id;
  }
  return where;
}

function buildLeadWhere(actor: AuthUser | undefined, from: Date, to: Date): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {
    createdAt: { gte: from, lte: to },
  };
  if (actor?.role === UserRole.MANAGER) {
    where.OR = [{ ownerId: actor.id }, { ownerId: null }];
  }
  return where;
}

const DATE_YMD = /^\d{4}-\d{2}-\d{2}$/;

function calendarDayBoundsKyiv(dateYmd: string): { from: Date; to: Date } {
  if (!DATE_YMD.test(dateYmd)) {
    throw new BadRequestException("Invalid date; use YYYY-MM-DD");
  }
  try {
    return kyivDayBounds(dateYmd);
  } catch {
    throw new BadRequestException("Invalid date");
  }
}

export type DailyTeamActivityRow = {
  userId: string;
  fullName: string;
  callsInbound: number;
  callsOutbound: number;
  visits: number;
  ordersCount: number;
  ordersAmount: number;
  paymentsAmount: number;
  dayPlanPercent: number;
  dayPlanStatus: DayPlanStatus;
};

export type DailyTeamActivityPayload = {
  /** Same YYYY-MM-DD as requested (Kyiv calendar day). */
  date: string;
  currency: string;
  rows: DailyTeamActivityRow[];
};

export type DashboardStats = {
  kpi: {
    ordersCount: number;
    revenue: number;
    leadsCount: number;
    leadsConversionPercent: number;
    debtTotal: number;
  };
  /** Phase 7: grouped by orderStage (new model). */
  ordersByStage: { orderStage: string; count: number }[];
  leadsByStatus: { status: string; count: number }[];
  leadsBySource: { source: string; count: number }[];
  revenueByDay: { date: string; totalAmount: number; count: number }[];
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly dayPlan: DayPlanService,
  ) {}

  async getStats(period: DashboardPeriod, actor?: AuthUser): Promise<DashboardStats> {
    const { from, to } = getDateRange(period);
    const orderWhere = buildOrderWhere(actor, from, to);
    const leadWhere = buildLeadWhere(actor, from, to);

    const [
      ordersAgg,
      ordersCount,
      ordersByStageRows,
      leadsCount,
      leadsWonCount,
      leadsByStatusRows,
      leadsBySourceRows,
      revenueByDayRows,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: orderWhere,
        _sum: { totalAmount: true, debtAmount: true },
      }),
      this.prisma.order.count({ where: orderWhere }),
      this.prisma.order.groupBy({
        by: ["orderStage"],
        where: orderWhere,
        _count: { id: true },
      }),
      this.prisma.lead.count({ where: leadWhere }),
      this.prisma.lead.count({
        where: { ...leadWhere, status: "WON" },
      }),
      this.prisma.lead.groupBy({
        by: ["status"],
        where: leadWhere,
        _count: { id: true },
      }),
      this.prisma.lead.groupBy({
        by: ["source"],
        where: leadWhere,
        _count: { id: true },
      }),
      this.getRevenueByDay(orderWhere),
    ]);

    // KPI revenue: gross totalAmount (debtTotal already reflects returnAdjustmentAmount via recalcOrder)
    const revenue = Number(ordersAgg._sum.totalAmount ?? 0);
    const debtTotal = Number(ordersAgg._sum.debtAmount ?? 0);
    const conversionPercent = leadsCount > 0 ? Math.round((leadsWonCount / leadsCount) * 100) : 0;

    return {
      kpi: {
        ordersCount,
        revenue,
        leadsCount,
        leadsConversionPercent: conversionPercent,
        debtTotal,
      },
      ordersByStage: ordersByStageRows.map((r) => ({
        orderStage: r.orderStage ?? "NEW",
        count: r._count.id,
      })),
      leadsByStatus: leadsByStatusRows.map((r) => ({ status: r.status, count: r._count.id })),
      leadsBySource: leadsBySourceRows.map((r) => ({ source: r.source, count: r._count.id })),
      revenueByDay: revenueByDayRows,
    };
  }

  /** Revenue by day: uses effective total (totalAmount − returnAdjustmentAmount) for consistency with debt. */
  private async getRevenueByDay(
    orderWhere: Prisma.OrderWhereInput,
  ): Promise<{ date: string; totalAmount: number; count: number }[]> {
    const orders = await this.prisma.order.findMany({
      where: orderWhere,
      select: { createdAt: true, totalAmount: true, returnAdjustmentAmount: true },
    });
    const byDay = new Map<string, { totalAmount: number; count: number }>();
    for (const o of orders) {
      const date = instantToKyivYmd(o.createdAt);
      const cur = byDay.get(date) ?? { totalAmount: 0, count: 0 };
      const total = Number(o.totalAmount ?? 0);
      const adj = Number(o.returnAdjustmentAmount ?? 0);
      cur.totalAmount += Math.max(0, total - adj);
      cur.count += 1;
      byDay.set(date, cur);
    }
    return Array.from(byDay.entries())
      .map(([date, v]) => ({ date, totalAmount: v.totalAmount, count: v.count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private async resolveVisibleUserIds(actor: AuthUser): Promise<string[]> {
    if (actor.role === UserRole.ADMIN) {
      const rows = await this.prisma.user.findMany({
        where: { role: { in: [UserRole.MANAGER, UserRole.LEAD, UserRole.ADMIN] } },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }
    if (actor.role === UserRole.LEAD) {
      const team = await this.prisma.user.findMany({
        where: { leadId: actor.id },
        select: { id: true },
      });
      return [actor.id, ...team.map((t) => t.id)];
    }
    if (actor.role === UserRole.MANAGER) {
      return [actor.id];
    }
    return [];
  }

  async getDailyTeamActivity(dateRaw: string | undefined, actor: AuthUser): Promise<DailyTeamActivityPayload> {
    const trimmed = dateRaw?.trim();
    if (trimmed && !DATE_YMD.test(trimmed)) {
      throw new BadRequestException("Invalid date; use YYYY-MM-DD");
    }
    const dateYmd = trimmed && DATE_YMD.test(trimmed) ? trimmed : todayYmdKyiv();
    const { from, to } = calendarDayBoundsKyiv(dateYmd);

    const visibleIds = await this.resolveVisibleUserIds(actor);
    if (visibleIds.length === 0) {
      const rates = await this.settings.getExchangeRates();
      return { date: dateYmd, currency: getBaseCurrency(rates), rows: [] };
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: visibleIds } },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    });

    type Acc = {
      userId: string;
      fullName: string;
      callsInbound: number;
      callsOutbound: number;
      visits: number;
      ordersCount: number;
      ordersAmount: number;
      paymentsAmount: number;
    };

    const byId = new Map<string, Acc>();
    for (const u of users) {
      byId.set(u.id, {
        userId: u.id,
        fullName: u.fullName,
        callsInbound: 0,
        callsOutbound: 0,
        visits: 0,
        ordersCount: 0,
        ordersAmount: 0,
        paymentsAmount: 0,
      });
    }

    const [rates, callGroups, visitGroups, orderGroups, payments] = await Promise.all([
      this.settings.getExchangeRates(),
      this.prisma.call.groupBy({
        by: ["managerUserId", "direction"],
        where: {
          startedAt: { gte: from, lte: to },
          managerUserId: { in: visibleIds },
        },
        _count: { id: true },
      }),
      this.prisma.visit.groupBy({
        by: ["ownerId"],
        where: {
          ownerId: { in: visibleIds },
          startsAt: { gte: from, lte: to },
          // Dashboard visits metric counts only completed visits.
          status: VisitStatus.DONE,
        },
        _count: { id: true },
      }),
      this.prisma.order.groupBy({
        by: ["ownerId"],
        where: {
          ownerId: { in: visibleIds },
          createdAt: { gte: from, lte: to },
        },
        _count: { id: true },
        _sum: { totalAmount: true },
      }),
      this.prisma.payment.findMany({
        where: {
          paidAt: { gte: from, lte: to },
          status: PaymentStatus.COMPLETED,
          order: { ownerId: { in: visibleIds } },
        },
        select: {
          amountUsd: true,
          amount: true,
          currency: true,
          order: { select: { ownerId: true } },
        },
      }),
    ]);

    for (const g of callGroups) {
      const uid = g.managerUserId;
      if (!uid) continue;
      const row = byId.get(uid);
      if (!row) continue;
      const dir = (g.direction || "").toUpperCase();
      if (dir === "INBOUND") row.callsInbound += g._count.id;
      else if (dir === "OUTBOUND") row.callsOutbound += g._count.id;
    }

    for (const g of visitGroups) {
      const row = byId.get(g.ownerId);
      if (row) row.visits += g._count.id;
    }

    for (const g of orderGroups) {
      const row = byId.get(g.ownerId);
      if (row) {
        row.ordersCount += g._count.id;
        row.ordersAmount += Number(g._sum.totalAmount ?? 0);
      }
    }

    for (const p of payments) {
      const oid = p.order.ownerId;
      const row = byId.get(oid);
      if (!row) continue;
      row.paymentsAmount += paymentToBase(p.amountUsd, p.amount, p.currency, rates);
    }

    const baseCurrency = getBaseCurrency(rates);
    const dayPlanByUser = await this.dayPlan.getOverallPercentsForUsers(
      users.map((u) => u.id),
      dateYmd,
    );

    const rows: DailyTeamActivityRow[] = users.map((u) => {
      const r = byId.get(u.id)!;
      const dayPlan = dayPlanByUser.get(u.id);
      return {
        userId: r.userId,
        fullName: r.fullName,
        callsInbound: r.callsInbound,
        callsOutbound: r.callsOutbound,
        visits: r.visits,
        ordersCount: r.ordersCount,
        ordersAmount: Math.round(r.ordersAmount * 100) / 100,
        paymentsAmount: Math.round(r.paymentsAmount * 100) / 100,
        dayPlanPercent: dayPlan?.percent ?? 0,
        dayPlanStatus: dayPlan?.status ?? "red",
      };
    });

    return { date: dateYmd, currency: baseCurrency, rows };
  }
}
