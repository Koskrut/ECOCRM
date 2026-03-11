import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

export type DashboardPeriod = "week" | "month";

function getDateRange(period: DashboardPeriod): { from: Date; to: Date } {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  const days = period === "week" ? 6 : 29;
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);
  return { from, to };
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

export type DashboardStats = {
  kpi: {
    ordersCount: number;
    revenue: number;
    leadsCount: number;
    leadsConversionPercent: number;
    debtTotal: number;
  };
  ordersByStatus: { status: string; count: number }[];
  leadsByStatus: { status: string; count: number }[];
  leadsBySource: { source: string; count: number }[];
  revenueByDay: { date: string; totalAmount: number; count: number }[];
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(period: DashboardPeriod, actor?: AuthUser): Promise<DashboardStats> {
    const { from, to } = getDateRange(period);
    const orderWhere = buildOrderWhere(actor, from, to);
    const leadWhere = buildLeadWhere(actor, from, to);

    const [
      ordersAgg,
      ordersCount,
      ordersByStatusRows,
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
        by: ["status"],
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
      ordersByStatus: ordersByStatusRows.map((r) => ({ status: r.status, count: r._count.id })),
      leadsByStatus: leadsByStatusRows.map((r) => ({ status: r.status, count: r._count.id })),
      leadsBySource: leadsBySourceRows.map((r) => ({ source: r.source, count: r._count.id })),
      revenueByDay: revenueByDayRows,
    };
  }

  private async getRevenueByDay(
    orderWhere: Prisma.OrderWhereInput,
  ): Promise<{ date: string; totalAmount: number; count: number }[]> {
    const orders = await this.prisma.order.findMany({
      where: orderWhere,
      select: { createdAt: true, totalAmount: true },
    });
    const byDay = new Map<string, { totalAmount: number; count: number }>();
    for (const o of orders) {
      const date = o.createdAt.toISOString().slice(0, 10);
      const cur = byDay.get(date) ?? { totalAmount: 0, count: 0 };
      cur.totalAmount += Number(o.totalAmount ?? 0);
      cur.count += 1;
      byDay.set(date, cur);
    }
    return Array.from(byDay.entries())
      .map(([date, v]) => ({ date, totalAmount: v.totalAmount, count: v.count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}
