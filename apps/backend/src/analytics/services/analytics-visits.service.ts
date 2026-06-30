import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { AnalyticsScope } from "../analytics-scope.service";
import type { ResolvedPeriod } from "../utils/analytics-date.util";

@Injectable()
export class AnalyticsVisitsService {
  constructor(private readonly prisma: PrismaService) {}

  async getVisits(period: ResolvedPeriod, scope: AnalyticsScope) {
    const ownerFilter: any = {};
    if (scope.orderScope.managerId) ownerFilter.ownerId = scope.orderScope.managerId;
    else if (scope.orderScope.allowedOwnerIds !== undefined) ownerFilter.ownerId = { in: scope.orderScope.allowedOwnerIds };

    const dateFilter = {
      OR: [
        { startsAt: { gte: period.from, lte: period.to } },
        {
          startsAt: null,
          completedAt: { gte: period.from, lte: period.to },
        },
      ],
    };

    const [total, byStatus, byManager] = await Promise.all([
      this.prisma.visit.count({
        where: { ...ownerFilter, ...dateFilter },
      }),
      this.prisma.visit.groupBy({
        by: ["status"],
        where: { ...ownerFilter, ...dateFilter },
        _count: { id: true },
      }),
      this.prisma.visit.groupBy({
        by: ["ownerId"],
        where: { ...ownerFilter, ...dateFilter },
        _count: { id: true },
      }),
    ]);

    const users = await this.prisma.user.findMany({
      where: { id: { in: byManager.map((x) => x.ownerId).filter(Boolean) as string[] } },
      select: { id: true, fullName: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u.fullName]));

    return {
      total,
      byStatus: byStatus.map((x) => ({ status: x.status, count: x._count.id })),
      byManager: byManager.map((x) => ({
        managerId: x.ownerId,
        managerName: x.ownerId ? nameById.get(x.ownerId) ?? x.ownerId : null,
        count: x._count.id,
      })),
    };
  }
}

