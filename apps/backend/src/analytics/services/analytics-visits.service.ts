import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { AnalyticsScope } from "../analytics-scope.service";
import type { ResolvedPeriod } from "../utils/analytics-date.util";

export type VisitsPayload = {
  total: number;
  done: number;
  canceled: number;
  completionRate: number;
  byOutcome: { outcome: string; count: number }[];
};

@Injectable()
export class AnalyticsVisitsService {
  constructor(private readonly prisma: PrismaService) {}

  async getVisits(
    period: ResolvedPeriod,
    scope: AnalyticsScope,
  ): Promise<VisitsPayload> {
    if (scope.emptyTeam) {
      return {
        total: 0,
        done: 0,
        canceled: 0,
        completionRate: 0,
        byOutcome: [],
      };
    }

    const ownerWhere: Prisma.VisitWhereInput = {};
    if (scope.orderScope.managerId) {
      ownerWhere.ownerId = scope.orderScope.managerId;
    } else if (scope.orderScope.allowedOwnerIds && scope.orderScope.allowedOwnerIds.length > 0) {
      ownerWhere.ownerId = { in: scope.orderScope.allowedOwnerIds };
    }

    const where: Prisma.VisitWhereInput = {
      ...ownerWhere,
      createdAt: { gte: period.from, lte: period.to },
    };

    const [total, done, canceled, outcomeRows] = await Promise.all([
      this.prisma.visit.count({ where }),
      this.prisma.visit.count({ where: { ...where, status: "DONE" } }),
      this.prisma.visit.count({ where: { ...where, status: "CANCELED" } }),
      this.prisma.visit.groupBy({
        by: ["outcome"],
        where: { ...where, outcome: { not: null } },
        _count: { id: true },
      }),
    ]);

    const completionRate = total > 0 ? Math.round((done / total) * 10000) / 100 : 0;

    return {
      total,
      done,
      canceled,
      completionRate,
      byOutcome: outcomeRows.map((r) => ({
        outcome: r.outcome ?? "UNKNOWN",
        count: r._count.id,
      })),
    };
  }
}
